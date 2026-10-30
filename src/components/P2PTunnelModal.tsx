import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Download,
  Copy,
  Check,
  Zap,
  Shield,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Loader2,
  KeyRound,
  Link2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  WebRtcP2PTunnel,
  P2PTransferProgress,
  createP2PRoomWithCode,
  fetchOfferByCode,
  submitAnswerByCode,
  pollForAnswer,
} from '../services/webRtcService';

interface P2PTunnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedFile?: File | Blob | null;
  preselectedFilename?: string;
  onFileReceived?: (file: File) => void;
}

export const P2PTunnelModal: React.FC<P2PTunnelModalProps> = ({
  isOpen,
  onClose,
  preselectedFile,
  preselectedFilename,
  onFileReceived,
}) => {
  const [mode, setMode] = useState<'send' | 'receive'>(preselectedFile ? 'send' : 'receive');
  const [tunnel, setTunnel] = useState<WebRtcP2PTunnel | null>(null);

  // 6-Digit Pairing State
  const [pairingCode, setPairingCode] = useState<string>('');
  const [receiverCodeInput, setReceiverCodeInput] = useState<string>('');
  const [isGeneratingCode, setIsGeneratingCode] = useState<boolean>(false);
  const [isConnectingReceiver, setIsConnectingReceiver] = useState<boolean>(false);
  const [hasCopiedCode, setHasCopiedCode] = useState<boolean>(false);
  const [hasCopiedBeamLink, setHasCopiedBeamLink] = useState<boolean>(false);

  // Manual fallback state
  const [showManualSdp, setShowManualSdp] = useState<boolean>(false);
  const [offerCode, setOfferCode] = useState<string>('');
  const [answerInput, setAnswerInput] = useState<string>('');
  const [offerInput, setOfferInput] = useState<string>('');
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');
  const [hasCopiedOffer, setHasCopiedOffer] = useState<boolean>(false);
  const [hasCopiedAnswer, setHasCopiedAnswer] = useState<boolean>(false);

  // File to send
  const [fileToSend, setFileToSend] = useState<File | null>(
    preselectedFile instanceof File ? preselectedFile : null
  );

  // Transfer state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [progress, setProgress] = useState<P2PTransferProgress | null>(null);
  const [receivedFile, setReceivedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (pollAbortControllerRef.current) {
        pollAbortControllerRef.current.abort();
        pollAbortControllerRef.current = null;
      }
      if (tunnel) tunnel.close();
      setTunnel(null);
      setPairingCode('');
      setReceiverCodeInput('');
      setOfferCode('');
      setAnswerInput('');
      setOfferInput('');
      setGeneratedAnswer('');
      setIsConnected(false);
      setIsGeneratingCode(false);
      setIsConnectingReceiver(false);
      setProgress(null);
      setReceivedFile(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // SENDER: Start 6-Digit Tunnel
  const handleStartSender = async () => {
    try {
      setError(null);
      setIsGeneratingCode(true);

      const newTunnel = new WebRtcP2PTunnel();
      setTunnel(newTunnel);

      const { offerString, onConnected } = await newTunnel.createOffer();
      setOfferCode(offerString);

      onConnected.then(() => {
        setIsConnected(true);
        setIsGeneratingCode(false);
      });

      try {
        const code = await createP2PRoomWithCode(offerString);
        setPairingCode(code);
        setIsGeneratingCode(false);

        pollAbortControllerRef.current = new AbortController();
        pollForAnswer(
          code,
          async (answer) => {
            try {
              await newTunnel.acceptAnswer(answer);
            } catch (err: any) {
              console.warn('Auto answer apply failed:', err);
            }
          },
          pollAbortControllerRef.current.signal
        ).catch(() => {});
      } catch (signalingErr: any) {
        console.warn('Signaling room failed, falling back to manual SDP:', signalingErr);
        setIsGeneratingCode(false);
        setShowManualSdp(true);
      }
    } catch (e: any) {
      setError(`Failed to create P2P offer: ${e.message}`);
      setIsGeneratingCode(false);
    }
  };

  // RECEIVER: Connect via 6-Digit Code
  const handleConnectByCode = async () => {
    const cleanCode = receiverCodeInput.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    try {
      setError(null);
      setIsConnectingReceiver(true);

      const offerString = await fetchOfferByCode(cleanCode);

      const newTunnel = new WebRtcP2PTunnel();
      setTunnel(newTunnel);

      const { answerString, onConnected } = await newTunnel.handleOfferAndCreateAnswer(offerString);
      setGeneratedAnswer(answerString);

      await submitAnswerByCode(cleanCode, answerString);

      onConnected.then(() => {
        setIsConnected(true);
        setIsConnectingReceiver(false);
        newTunnel.receiveFile(
          (p) => setProgress(p),
          (file) => {
            setReceivedFile(file);
            if (onFileReceived) onFileReceived(file);
          }
        );
      });
    } catch (err: any) {
      setError(err.message || 'Could not connect with 6-digit code. Please verify the code.');
      setIsConnectingReceiver(false);
    }
  };

  // SENDER: Stream File
  const handleSendFile = async () => {
    const target = fileToSend || preselectedFile;
    if (!tunnel || !target) return;
    const name = fileToSend?.name || preselectedFilename || 'matrix-p2p-asset.bin';
    const type = fileToSend?.type || 'application/octet-stream';

    try {
      await tunnel.streamFile(target, name, type, (p) => {
        setProgress(p);
      });
    } catch (e: any) {
      setError(`Transfer error: ${e.message}`);
    }
  };

  // Manual Fallback Handlers
  const handleApplyManualAnswer = async () => {
    if (!tunnel || !answerInput.trim()) return;
    try {
      await tunnel.acceptAnswer(answerInput.trim());
    } catch (e: any) {
      setError(`Failed to connect with answer: ${e.message}`);
    }
  };

  const handleProcessManualOffer = async () => {
    if (!offerInput.trim()) return;
    try {
      setError(null);
      const newTunnel = new WebRtcP2PTunnel();
      setTunnel(newTunnel);

      const { answerString, onConnected } = await newTunnel.handleOfferAndCreateAnswer(
        offerInput.trim()
      );
      setGeneratedAnswer(answerString);

      onConnected.then(() => {
        setIsConnected(true);
        newTunnel.receiveFile(
          (p) => setProgress(p),
          (file) => {
            setReceivedFile(file);
            if (onFileReceived) onFileReceived(file);
          }
        );
      });
    } catch (e: any) {
      setError(`Invalid offer code: ${e.message}`);
    }
  };

  const formatSpeed = (speedBps: number) => {
    if (speedBps === 0) return '0 B/s';
    const mbps = speedBps / (1024 * 1024);
    return `${mbps.toFixed(1)} MB/s`;
  };

  const beamShareUrl = pairingCode ? `${window.location.origin}${window.location.pathname}#beam=${pairingCode}` : '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <KeyRound size={17} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Direct WebRTC P2P Beam</h3>
              <p className="text-[11px] text-slate-400">Zero-cloud direct streaming with 6-digit pairing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Selector */}
        {!isConnected && (
          <div className="grid grid-cols-2 p-2 bg-slate-50 border-b border-slate-100 gap-2">
            <button
              onClick={() => {
                setMode('send');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all ${
                mode === 'send'
                  ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Send size={13} />
              <span>Send File (Host)</span>
            </button>
            <button
              onClick={() => {
                setMode('receive');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all ${
                mode === 'receive'
                  ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Download size={13} />
              <span>Receive File (Peer)</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ACTIVE CONNECTION / TRANSFER VIEW */}
          {isConnected ? (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 size={16} />
                  <span>Encrypted P2P DataChannel Connected</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-600 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  Direct Tunnel
                </span>
              </div>

              {/* SENDER CONTROLS */}
              {mode === 'send' && !progress && (
                <div className="space-y-3">
                  <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <HardDrive size={16} className="text-slate-500 shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {fileToSend?.name || preselectedFilename || 'Select file to send'}
                      </span>
                    </div>
                    {!preselectedFile && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer shrink-0"
                      >
                        Browse...
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setFileToSend(e.target.files[0]);
                      }}
                    />
                  </div>

                  <button
                    onClick={handleSendFile}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <Send size={13} />
                    <span>Stream File Over P2P Tunnel</span>
                  </button>
                </div>
              )}

              {/* TRANSFER PROGRESS */}
              {progress && (
                <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800 capitalize">
                        {progress.stage === 'transferring'
                          ? mode === 'send'
                            ? 'Streaming to peer...'
                            : 'Receiving byte stream...'
                          : progress.stage}
                      </span>
                    </div>
                    <span className="font-mono text-indigo-600 font-bold">{progress.percentage}%</span>
                  </div>

                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-200"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>
                      {(progress.bytesTransferred / (1024 * 1024)).toFixed(1)} /{' '}
                      {(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <span>{formatSpeed(progress.speedBps)}</span>
                  </div>
                </div>
              )}

              {/* RECEIVER COMPLETE */}
              {receivedFile && (
                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-xs">
                    <Check size={20} />
                  </div>
                  <h4 className="font-bold text-xs text-indigo-900">File Reconstructed Bit-Exact!</h4>
                  <p className="text-[11px] text-indigo-700">{receivedFile.name} ({(receivedFile.size / (1024 * 1024)).toFixed(2)} MB)</p>
                  <a
                    href={URL.createObjectURL(receivedFile)}
                    download={receivedFile.name}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Save to Disk</span>
                  </a>
                </div>
              )}
            </div>
          ) : mode === 'send' ? (
            /* SENDER 6-DIGIT FLOW */
            <div className="space-y-4">
              {!pairingCode && !isGeneratingCode ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                    File selected:{' '}
                    <strong className="text-slate-900 font-semibold">
                      {fileToSend?.name || preselectedFilename || 'Ready to stream'}
                    </strong>
                  </div>
                  <button
                    onClick={handleStartSender}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <Zap size={14} />
                    <span>Get 6-Digit Pairing Code</span>
                  </button>
                </div>
              ) : isGeneratingCode ? (
                <div className="p-6 text-center space-y-2">
                  <Loader2 size={24} className="animate-spin text-indigo-600 mx-auto" />
                  <p className="text-xs font-bold text-slate-800">Generating 6-Digit PIN...</p>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-4">
                  <div className="text-xs text-slate-600">
                    Ask recipient to enter this 6-digit code in their browser:
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    {pairingCode.split('').map((d, i) => (
                      <React.Fragment key={i}>
                        {i === 3 && <span className="text-xl font-bold text-slate-300">-</span>}
                        <div className="w-10 h-13 rounded-xl bg-white border-2 border-indigo-400 font-mono text-2xl font-bold flex items-center justify-center text-slate-900 shadow-2xs">
                          {d}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="flex justify-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(pairingCode);
                        setHasCopiedCode(true);
                        setTimeout(() => setHasCopiedCode(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      {hasCopiedCode ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      <span>{hasCopiedCode ? 'Copied' : 'Copy PIN'}</span>
                    </button>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(beamShareUrl);
                        setHasCopiedBeamLink(true);
                        setTimeout(() => setHasCopiedBeamLink(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      {hasCopiedBeamLink ? <Check size={13} /> : <Link2 size={13} />}
                      <span>{hasCopiedBeamLink ? 'Link Copied' : 'Copy 1-Click Link'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-indigo-700 pt-1">
                    <Loader2 size={13} className="animate-spin text-indigo-600" />
                    <span>Waiting for receiver to connect...</span>
                  </div>
                </div>
              )}

              {/* Collapsible Manual SDP */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => setShowManualSdp(!showManualSdp)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                >
                  {showManualSdp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span>Advanced / Offline Manual SDP Mode</span>
                </button>
                {showManualSdp && offerCode && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center text-[11px] font-semibold text-slate-700">
                      <span>Raw Offer SDP:</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(offerCode);
                          setHasCopiedOffer(true);
                          setTimeout(() => setHasCopiedOffer(false), 2000);
                        }}
                        className="text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        {hasCopiedOffer ? <Check size={11} /> : <Copy size={11} />}
                        <span>{hasCopiedOffer ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={offerCode}
                      rows={2}
                      className="w-full font-mono text-[9px] p-1.5 bg-white rounded border border-slate-200"
                    />
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Paste receiver answer string..."
                        value={answerInput}
                        onChange={(e) => setAnswerInput(e.target.value)}
                        className="flex-1 font-mono text-[11px] p-1.5 bg-white rounded border border-slate-200"
                      />
                      <button
                        onClick={handleApplyManualAnswer}
                        disabled={!answerInput.trim()}
                        className="px-2.5 py-1 bg-slate-800 text-white rounded text-xs font-semibold disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* RECEIVER 6-DIGIT FLOW */
            <div className="space-y-4">
              <div className="text-center space-y-3 py-2">
                <div className="text-xs text-slate-600">Enter the 6-digit PIN from the sender:</div>
                <div className="flex justify-center">
                  <input
                    type="text"
                    maxLength={7}
                    placeholder="123 - 456"
                    value={receiverCodeInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      if (val.length > 3) {
                        setReceiverCodeInput(`${val.slice(0, 3)} - ${val.slice(3)}`);
                      } else {
                        setReceiverCodeInput(val);
                      }
                    }}
                    className="w-48 h-12 text-center font-mono text-xl tracking-widest font-extrabold rounded-xl border-2 border-indigo-400 bg-indigo-50/20 text-slate-900 focus:outline-none focus:border-indigo-600"
                  />
                </div>
                <button
                  onClick={handleConnectByCode}
                  disabled={receiverCodeInput.replace(/\D/g, '').length !== 6 || isConnectingReceiver}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center justify-center gap-2"
                >
                  {isConnectingReceiver ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Connecting Direct Tunnel...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      <span>Connect &amp; Receive File</span>
                    </>
                  )}
                </button>
              </div>

              {/* Collapsible Manual SDP for Receiver */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => setShowManualSdp(!showManualSdp)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                >
                  {showManualSdp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span>Advanced / Offline Manual SDP Mode</span>
                </button>
                {showManualSdp && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <textarea
                      placeholder="Paste raw sender offer string..."
                      value={offerInput}
                      onChange={(e) => setOfferInput(e.target.value)}
                      rows={2}
                      className="w-full font-mono text-[9px] p-1.5 bg-white rounded border border-slate-200"
                    />
                    {!generatedAnswer && (
                      <button
                        onClick={handleProcessManualOffer}
                        disabled={!offerInput.trim()}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold disabled:opacity-50"
                      >
                        Accept Offer &amp; Generate Answer
                      </button>
                    )}
                    {generatedAnswer && (
                      <div className="pt-1 space-y-1">
                        <div className="flex justify-between items-center text-[11px] font-semibold text-slate-700">
                          <span>Your Answer:</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(generatedAnswer);
                              setHasCopiedAnswer(true);
                              setTimeout(() => setHasCopiedAnswer(false), 2000);
                            }}
                            className="text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            {hasCopiedAnswer ? <Check size={11} /> : <Copy size={11} />}
                            <span>{hasCopiedAnswer ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                        <textarea
                          readOnly
                          value={generatedAnswer}
                          rows={2}
                          className="w-full font-mono text-[9px] p-1.5 bg-white rounded border border-slate-200"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
