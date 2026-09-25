/**
 * Matrix WebRTC Sovereign P2P Tunneling Service
 * 
 * Enables zero-cloud, direct browser-to-browser data streaming:
 * - Creates direct encrypted RTCDataChannel between two peer browsers.
 * - Exchanges compressed SDP offers/answers via URL hashes or compact base64 codes.
 * - Streams multi-megabyte / gigabyte binary files in 64KB chunks with flow control.
 * - Zero intermediary storage, zero relay server logging.
 */

export interface P2PFileMetadata {
  filename: string;
  mimeType: string;
  size: number;
  totalChunks: number;
}

export interface P2PTransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  speedBps: number;
  stage: 'negotiating' | 'connected' | 'transferring' | 'assembling' | 'complete' | 'error';
  errorMessage?: string;
}

const CHUNK_SIZE = 64 * 1024; // 64 KB per RTC slice
const STUN_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export class WebRtcP2PTunnel {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private role: 'sender' | 'receiver' = 'sender';

  /**
   * Sender: Creates an SDP Offer and returns a compressed handshake string
   */
  public async createOffer(): Promise<{
    offerString: string;
    onConnected: Promise<void>;
  }> {
    this.role = 'sender';
    this.peer = new RTCPeerConnection(STUN_SERVERS);

    this.channel = this.peer.createDataChannel('matrix-p2p-vault', {
      ordered: true,
    });

    let connectedResolve: () => void;
    let connectedReject: (err: any) => void;
    const onConnected = new Promise<void>((resolve, reject) => {
      connectedResolve = resolve;
      connectedReject = reject;
    });

    this.channel.onopen = () => {
      connectedResolve();
    };

    this.channel.onerror = (err) => {
      console.error('WebRTC Channel Error:', err);
    };

    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    // Wait for ICE candidates to gather
    await new Promise<void>((resolve) => {
      if (!this.peer) return resolve();
      if (this.peer.iceGatheringState === 'complete') {
        resolve();
      } else {
        const check = () => {
          if (this.peer?.iceGatheringState === 'complete') {
            this.peer.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        this.peer.addEventListener('icegatheringstatechange', check);
        // Timeout safeguard
        setTimeout(resolve, 2000);
      }
    });

    const localDesc = this.peer.localDescription;
    const offerPayload = JSON.stringify(localDesc);
    const offerString = btoa(encodeURIComponent(offerPayload));

    return { offerString, onConnected };
  }

  /**
   * Receiver: Ingests Sender's offer and generates an SDP Answer
   */
  public async handleOfferAndCreateAnswer(
    offerString: string
  ): Promise<{
    answerString: string;
    onConnected: Promise<void>;
  }> {
    this.role = 'receiver';
    this.peer = new RTCPeerConnection(STUN_SERVERS);

    let connectedResolve: () => void;
    const onConnected = new Promise<void>((resolve) => {
      connectedResolve = resolve;
    });

    this.peer.ondatachannel = (e) => {
      this.channel = e.channel;
      this.channel.onopen = () => {
        connectedResolve();
      };
    };

    const offerPayload = decodeURIComponent(atob(offerString));
    const offerDesc = JSON.parse(offerPayload);
    await this.peer.setRemoteDescription(new RTCSessionDescription(offerDesc));

    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);

    // Wait for ICE gathering
    await new Promise<void>((resolve) => {
      if (!this.peer) return resolve();
      if (this.peer.iceGatheringState === 'complete') {
        resolve();
      } else {
        const check = () => {
          if (this.peer?.iceGatheringState === 'complete') {
            this.peer.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        this.peer.addEventListener('icegatheringstatechange', check);
        setTimeout(resolve, 2000);
      }
    });

    const answerPayload = JSON.stringify(this.peer.localDescription);
    const answerString = btoa(encodeURIComponent(answerPayload));

    return { answerString, onConnected };
  }

  /**
   * Sender: Applies Receiver's answer to complete handshake
   */
  public async acceptAnswer(answerString: string): Promise<void> {
    if (!this.peer) throw new Error('PeerConnection not initialized');
    const answerPayload = decodeURIComponent(atob(answerString));
    const answerDesc = JSON.parse(answerPayload);
    await this.peer.setRemoteDescription(new RTCSessionDescription(answerDesc));
  }

  /**
   * Sender: Streams an in-memory File or Blob directly to Receiver
   */
  public async streamFile(
    file: File | Blob,
    filename: string,
    mimeType: string,
    onProgress: (p: P2PTransferProgress) => void
  ): Promise<void> {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('P2P DataChannel is not open');
    }

    const totalBytes = file.size;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

    // 1. Send file header packet
    const meta: P2PFileMetadata = {
      filename,
      mimeType,
      size: totalBytes,
      totalChunks,
    };
    this.channel.send(JSON.stringify({ type: 'MATRIX_P2P_HEADER', meta }));

    // 2. Read and stream slices
    let bytesSent = 0;
    const startTime = performance.now();

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const slice = file.slice(start, end);
      const buffer = await slice.arrayBuffer();

      // Flow control: wait if buffer threshold is high
      while (this.channel.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 20));
      }

      this.channel.send(buffer);
      bytesSent += buffer.byteLength;

      const elapsedSec = (performance.now() - startTime) / 1000;
      const speedBps = elapsedSec > 0 ? bytesSent / elapsedSec : 0;

      onProgress({
        bytesTransferred: bytesSent,
        totalBytes,
        percentage: Math.round((bytesSent / totalBytes) * 100),
        speedBps,
        stage: 'transferring',
      });
    }

    // 3. Send EOF packet
    this.channel.send(JSON.stringify({ type: 'MATRIX_P2P_EOF' }));

    onProgress({
      bytesTransferred: totalBytes,
      totalBytes,
      percentage: 100,
      speedBps: 0,
      stage: 'complete',
    });
  }

  /**
   * Receiver: Receives incoming streamed file packets
   */
  public receiveFile(
    onProgress: (p: P2PTransferProgress) => void,
    onComplete: (file: File) => void
  ): void {
    if (!this.channel) throw new Error('DataChannel not initialized');

    this.channel.binaryType = 'arraybuffer';
    let meta: P2PFileMetadata | null = null;
    let receivedChunks: ArrayBuffer[] = [];
    let bytesReceived = 0;
    let startTime = performance.now();

    this.channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'MATRIX_P2P_HEADER') {
            meta = packet.meta;
            receivedChunks = [];
            bytesReceived = 0;
            startTime = performance.now();
            onProgress({
              bytesTransferred: 0,
              totalBytes: meta?.size || 0,
              percentage: 0,
              speedBps: 0,
              stage: 'transferring',
            });
          } else if (packet.type === 'MATRIX_P2P_EOF' && meta) {
            onProgress({
              bytesTransferred: bytesReceived,
              totalBytes: meta.size,
              percentage: 100,
              speedBps: 0,
              stage: 'assembling',
            });

            const blob = new Blob(receivedChunks, { type: meta.mimeType });
            const file = new File([blob], meta.filename, { type: meta.mimeType });
            onComplete(file);

            onProgress({
              bytesTransferred: bytesReceived,
              totalBytes: meta.size,
              percentage: 100,
              speedBps: 0,
              stage: 'complete',
            });
          }
        } catch (e) {
          console.warn('P2P Message parse error', e);
        }
      } else if (event.data instanceof ArrayBuffer && meta) {
        receivedChunks.push(event.data);
        bytesReceived += event.data.byteLength;

        const elapsedSec = (performance.now() - startTime) / 1000;
        const speedBps = elapsedSec > 0 ? bytesReceived / elapsedSec : 0;

        onProgress({
          bytesTransferred: bytesReceived,
          totalBytes: meta.size,
          percentage: Math.round((bytesReceived / meta.size) * 100),
          speedBps,
          stage: 'transferring',
        });
      }
    };
  }

  public close(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
    if (this.peer) {
      try {
        this.peer.close();
      } catch {}
      this.peer = null;
    }
  }
}
