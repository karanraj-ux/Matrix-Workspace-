import React, { useState, useRef, useEffect } from 'react';
import {
  Radio,
  Send,
  Download,
  Copy,
  Check,
  Zap,
  HardDrive,
  Loader2,
  AlertTriangle,
  UploadCloud,
  Sparkles,
  Link2,
  ChevronDown,
  ChevronUp,
  Share2,
  KeyRound,
} from 'lucide-react';
import {
  WebRtcP2PTunnel,
  P2PTransferProgress,
  createP2PRoomWithCode,
  fetchOfferByCode,
  submitAnswerByCode,
  pollForAnswer,
} from '../services/webRtcService';

export const P2PBeamView: React.FC<{ onNavigateToVault?: () => void }> = ({ onNavigateToVault }) => {
  const [mode, setMode] = useState<'send' | 'receive'>('send');
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
  const [fileToSend, setFileToSend] = useState<File | null>(null);

  // Transfer state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [progress, setProgress] = useState<P2PTransferProgress | null>(null);
  const [receivedFile, setReceivedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollAbortControllerRef = useRef<AbortController | null>(null);

  // Check URL hash for direct #beam=123456 link
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('beam=')) {
      const match = window.location.hash.match(/beam=([0-9]{6})/);
      if (match && match[1]) {
        setMode('receive');
        setReceiverCodeInput(match[1]);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollAbortControllerRef.current) {
        pollAbortControllerRef.current.abort();
      }
      if (tunnel) {
        tunnel.close();
      }
    };
  }, [tunnel]);

  // SENDER: Create WebRTC Offer & Register 6-Digit Room
  const handleStartSender = async () => {
    try {
      setError(null);
      setIsGeneratingCode(true);

      const newTunnel = new WebRtcP2PTunnel();
      setTunnel(newTunnel);

      const { offerString, onConnected } = await newTunnel.createOffer();
      setOfferCode(offerString);

      // Listen for data channel open
      onConnected.then(() => {
        setIsConnected(true);
        setIsGeneratingCode(false);
      });

      // Register with signaling server for 6-digit code
      try {
        const code = await createP2PRoomWithCode(offerString);
        setPairingCode(code);
        setIsGeneratingCode(false);

        // Start polling for receiver's answer automatically
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

      // Submit answer back to room for automatic sender pickup
      await submitAnswerByCode(cleanCode, answerString);

      onConnected.then(() => {
        setIsConnected(true);
        setIsConnectingReceiver(false);
        newTunnel.receiveFile(
          (p) => setProgress(p),
          (file) => {
            setReceivedFile(file);
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
    if (!tunnel || !fileToSend) return;
    try {
      await tunnel.streamFile(fileToSend, fileToSend.name, fileToSend.type, (p) => {
        setProgress(p);
      });
    } catch (e: any) {
      setError(`Transfer error: ${e.message}`);
    }
  };

  // Manual SDP Fallbacks
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
          }
        );
      });
    } catch (e: any) {
      setError(`Invalid offer code: ${e.message}`);
    }
  };

  const resetAll = () => {
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
    setFileToSend(null);
  };

  const formattedCode = pairingCode.length === 6 ? `${pairingCode.slice(0, 3)} - ${pairingCode.slice(3)}` : pairingCode;
  const beamShareUrl = pairingCode ? `${window.location.origin}${window.location.pathname}#beam=${pairingCode}` : '';

  return (
    <div className="flex-1 h-full bg-[#F8FAFC] text-slate-800 flex flex-col font-sans overflow-y-auto">
      <div className="p-6 md:p-8 max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/80 flex items-center justify-center shrink-0 shadow-xs">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
                  Direct P2P Beam
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                  6-Digit Instant
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Zero-cloud browser-to-browser streaming with NIST ML-KEM-768 post-quantum encryption.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetAll();
                setMode('send');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'send'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Send File
            </button>
            <button
              onClick={() => {
                resetAll();
                setMode('receive');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'receive'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Receive File
            </button>
          </div>
        </div>

        {/* ONE-CLICK SOVEREIGN MAGIC LINK RECOMMENDATION BANNER */}
        <div className="p-3.5 rounded-2xl bg-linear-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 border border-indigo-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Prefer Asynchronous &ldquo;Send &amp; Forget&rdquo;?</div>
              <p className="text-[11px] text-slate-600">
                Files in your Distributed Vault have permanent <strong>One-Click Magic Links</strong> that recipients can download anytime without both browsers staying open.
              </p>
            </div>
          </div>
          {onNavigateToVault && (
            <button
              onClick={onNavigateToVault}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Share2 size={13} />
              <span>Open Vault Links</span>
            </button>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* SEND MODE */}
        {/* ======================================================== */}
        {mode === 'send' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
            {!fileToSend ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-10 text-center cursor-pointer transition-all bg-slate-50/50 hover:bg-indigo-50/30 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFileToSend(e.target.files[0]);
                    }
                  }}
                />
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                  <UploadCloud size={28} />
                </div>
                <div className="font-bold text-sm text-slate-900">Choose a file to Beam directly</div>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Drag and drop or click to select files of any size for peer-to-peer streaming.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between p-4 rounded-xl bg-indigo-50/50 border border-indigo-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                      FILE
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{fileToSend.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {(fileToSend.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  {!pairingCode && !isGeneratingCode && !offerCode && (
                    <button
                      onClick={handleStartSender}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap size={14} /> Start Beam (Get 6-Digit Code)
                    </button>
                  )}
                  {isGeneratingCode && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Generating Pairing Code...</span>
                    </div>
                  )}
                </div>

                {/* 6-DIGIT PAIRING CARD */}
                {pairingCode && !isConnected && (
                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-4">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100/70 text-indigo-800 text-xs font-bold">
                      <KeyRound size={13} />
                      <span>Recipient Pairing Code</span>
                    </div>

                    <div className="text-xs text-slate-600 max-w-md mx-auto">
                      Ask the recipient to open <strong>Direct P2P Beam</strong> and enter this 6-digit code:
                    </div>

                    {/* BIG 6-DIGIT DISPLAY */}
                    <div className="flex items-center justify-center gap-2 sm:gap-3 py-2">
                      {pairingCode.split('').map((digit, idx) => (
                        <React.Fragment key={idx}>
                          {idx === 3 && <span className="text-2xl font-bold text-slate-300 mx-1">-</span>}
                          <div className="w-11 h-14 sm:w-13 sm:h-16 rounded-xl bg-white border-2 border-indigo-400 text-slate-900 font-mono text-2xl sm:text-3xl font-extrabold flex items-center justify-center shadow-xs">
                            {digit}
                          </div>
                        </React.Fragment>
                      ))}
                    </div>

                    {/* ACTION BUTTONS: COPY CODE & COPY LINK */}
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(pairingCode);
                          setHasCopiedCode(true);
                          setTimeout(() => setHasCopiedCode(false), 2000);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        {hasCopiedCode ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        <span>{hasCopiedCode ? 'Code Copied!' : 'Copy 6-Digit Code'}</span>
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(beamShareUrl);
                          setHasCopiedBeamLink(true);
                          setTimeout(() => setHasCopiedBeamLink(false), 2000);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        {hasCopiedBeamLink ? <Check size={14} /> : <Link2 size={14} />}
                        <span>{hasCopiedBeamLink ? '1-Click Link Copied!' : 'Copy 1-Click Link'}</span>
                      </button>
                    </div>

                    {/* LIVE RADAR WAITING BADGE */}
                    <div className="pt-2 flex items-center justify-center gap-2 text-xs text-indigo-700">
                      <Loader2 size={14} className="animate-spin text-indigo-600" />
                      <span>Waiting for recipient to enter code... Tunnel will connect automatically!</span>
                    </div>
                  </div>
                )}

                {/* CONNECTED STATE & SEND BUTTON */}
                {isConnected && !progress && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-emerald-900 text-xs font-bold">
                      <Check size={16} className="text-emerald-600" />
                      <span>Tunnel Connected &amp; Encrypted! Ready to beam.</span>
                    </div>
                    <button
                      onClick={handleSendFile}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Send size={14} /> Beam &ldquo;{fileToSend.name}&rdquo; Now
                    </button>
                  </div>
                )}

                {/* TRANSFER PROGRESS */}
                {progress && (
                  <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                    <div className="flex justify-between text-xs font-bold text-emerald-950">
                      <span>Streaming via DataChannel: {progress.percentage}%</span>
                      <span>{progress.speedBps > 0 ? (progress.speedBps / (1024 * 1024)).toFixed(1) : '0'} MB/s</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-emerald-200 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-200"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-emerald-800">
                      <span>
                        {(progress.bytesTransferred / (1024 * 1024)).toFixed(1)} /{' '}
                        {(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB transferred
                      </span>
                      {progress.isPostQuantumActive && (
                        <span className="font-semibold text-purple-700">NIST ML-KEM-768 Encrypted</span>
                      )}
                    </div>
                  </div>
                )}

                {/* COLLAPSIBLE ADVANCED OFFLINE SDP MODE */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setShowManualSdp(!showManualSdp)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                  >
                    {showManualSdp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>Advanced / Offline Manual SDP Mode</span>
                  </button>

                  {showManualSdp && offerCode && (
                    <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700">Raw WebRTC Offer Code:</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(offerCode);
                              setHasCopiedOffer(true);
                              setTimeout(() => setHasCopiedOffer(false), 2000);
                            }}
                            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            {hasCopiedOffer ? <Check size={12} /> : <Copy size={12} />}
                            <span>{hasCopiedOffer ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                        <textarea
                          readOnly
                          value={offerCode}
                          rows={2}
                          className="w-full font-mono text-[10px] p-2 bg-white rounded border border-slate-200 text-slate-600"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Paste Receiver Answer (Offline Manual):
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Paste answer string..."
                            value={answerInput}
                            onChange={(e) => setAnswerInput(e.target.value)}
                            className="flex-1 font-mono text-xs p-2 bg-white rounded border border-slate-200"
                          />
                          <button
                            onClick={handleApplyManualAnswer}
                            disabled={!answerInput.trim()}
                            className="px-3 py-1.5 bg-slate-800 text-white rounded text-xs font-semibold disabled:opacity-50"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* RECEIVE MODE */}
        {/* ======================================================== */}
        {mode === 'receive' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
            {!isConnected && !receivedFile && (
              <div className="max-w-md mx-auto text-center space-y-5 py-2">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                  <KeyRound size={28} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Enter Sender&rsquo;s 6-Digit Code</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Type the code displayed on the sender&rsquo;s screen to establish an instant direct tunnel.
                  </p>
                </div>

                {/* 6-DIGIT INPUT */}
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
                    className="w-56 h-14 text-center font-mono text-2xl tracking-widest font-extrabold rounded-2xl border-2 border-indigo-400 bg-indigo-50/30 text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all placeholder:text-slate-300"
                  />
                </div>

                <button
                  onClick={handleConnectByCode}
                  disabled={receiverCodeInput.replace(/\D/g, '').length !== 6 || isConnectingReceiver}
                  className="w-full max-w-xs mx-auto py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  {isConnectingReceiver ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Connecting Direct Tunnel...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={15} />
                      <span>Connect &amp; Receive File</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* RECEIVING PROGRESS */}
            {progress && !receivedFile && (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                <div className="flex justify-between text-xs font-bold text-emerald-950">
                  <span>Receiving Byte Stream: {progress.percentage}%</span>
                  <span>{progress.speedBps > 0 ? (progress.speedBps / (1024 * 1024)).toFixed(1) : '0'} MB/s</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-emerald-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-200"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-emerald-800">
                  <span>
                    {(progress.bytesTransferred / (1024 * 1024)).toFixed(1)} /{' '}
                    {(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB received
                  </span>
                  {progress.isPostQuantumActive && (
                    <span className="font-semibold text-purple-700">NIST ML-KEM-768 Verified</span>
                  )}
                </div>
              </div>
            )}

            {/* RECEIVED FILE SUCCESS DISPLAY */}
            {receivedFile && (
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-xs">
                  <Check size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-base text-emerald-950">Transfer Complete!</h4>
                  <p className="text-xs text-emerald-800 mt-1">
                    {receivedFile.name} ({(receivedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                </div>
                <div>
                  <a
                    href={URL.createObjectURL(receivedFile)}
                    download={receivedFile.name}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Download size={15} /> Save to Disk
                  </a>
                </div>
              </div>
            )}

            {/* COLLAPSIBLE ADVANCED OFFLINE SDP MODE */}
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowManualSdp(!showManualSdp)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
              >
                {showManualSdp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>Advanced / Offline Manual SDP Mode</span>
              </button>

              {showManualSdp && (
                <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Paste Sender Offer Code:
                    </label>
                    <textarea
                      placeholder="Paste raw SDP offer..."
                      value={offerInput}
                      onChange={(e) => setOfferInput(e.target.value)}
                      rows={2}
                      className="w-full font-mono text-xs p-2 bg-white rounded border border-slate-200 text-slate-700"
                    />
                    {!generatedAnswer && (
                      <button
                        onClick={handleProcessManualOffer}
                        disabled={!offerInput.trim()}
                        className="mt-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold disabled:opacity-50"
                      >
                        Accept Offer &amp; Generate Answer
                      </button>
                    )}
                  </div>

                  {generatedAnswer && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-700">Your Answer Code:</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(generatedAnswer);
                            setHasCopiedAnswer(true);
                            setTimeout(() => setHasCopiedAnswer(false), 2000);
                          }}
                          className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          {hasCopiedAnswer ? <Check size={12} /> : <Copy size={12} />}
                          <span>{hasCopiedAnswer ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={generatedAnswer}
                        rows={2}
                        className="w-full font-mono text-[10px] p-2 bg-white rounded border border-slate-200 text-slate-600"
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
  );
};
