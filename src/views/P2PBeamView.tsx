import React, { useState, useRef } from 'react';
import {
  Radio,
  Send,
  Download,
  Copy,
  Check,
  Zap,
  ShieldCheck,
  HardDrive,
  Loader2,
  AlertTriangle,
  UploadCloud,
} from 'lucide-react';
import { WebRtcP2PTunnel, P2PTransferProgress } from '../services/webRtcService';

export const P2PBeamView: React.FC = () => {
  const [mode, setMode] = useState<'send' | 'receive'>('send');
  const [tunnel, setTunnel] = useState<WebRtcP2PTunnel | null>(null);

  // Sender state
  const [offerCode, setOfferCode] = useState<string>('');
  const [answerInput, setAnswerInput] = useState<string>('');
  const [isWaitingAnswer, setIsWaitingAnswer] = useState<boolean>(false);
  const [hasCopiedOffer, setHasCopiedOffer] = useState<boolean>(false);

  // Receiver state
  const [offerInput, setOfferInput] = useState<string>('');
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');
  const [hasCopiedAnswer, setHasCopiedAnswer] = useState<boolean>(false);

  // File to send
  const [fileToSend, setFileToSend] = useState<File | null>(null);

  // Transfer state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [progress, setProgress] = useState<P2PTransferProgress | null>(null);
  const [receivedFile, setReceivedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStartSender = async () => {
    try {
      setError(null);
      const newTunnel = new WebRtcP2PTunnel();
      setTunnel(newTunnel);
      setIsWaitingAnswer(true);

      const { offerString, onConnected } = await newTunnel.createOffer();
      setOfferCode(offerString);

      onConnected.then(() => {
        setIsConnected(true);
        setIsWaitingAnswer(false);
      });
    } catch (e: any) {
      setError(`Failed to create P2P offer: ${e.message}`);
      setIsWaitingAnswer(false);
    }
  };

  const handleApplyAnswer = async () => {
    if (!tunnel || !answerInput.trim()) return;
    try {
      await tunnel.acceptAnswer(answerInput.trim());
    } catch (e: any) {
      setError(`Failed to connect with answer: ${e.message}`);
    }
  };

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

  const handleProcessOffer = async () => {
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
    if (tunnel) tunnel.close();
    setTunnel(null);
    setOfferCode('');
    setAnswerInput('');
    setOfferInput('');
    setGeneratedAnswer('');
    setIsConnected(false);
    setProgress(null);
    setReceivedFile(null);
    setError(null);
    setFileToSend(null);
  };

  return (
    <div className="flex-1 h-full bg-[#F8FAFC] text-slate-800 flex flex-col font-sans overflow-y-auto">
      <div className="p-6 md:p-8 max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200/80 flex items-center justify-center shrink-0 shadow-xs">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
                  Direct P2P Beam
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider">
                  Zero-Cloud
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Send large files browser-to-browser with WebRTC and Post-Quantum handshake. Never touches Google Drive quota.
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
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Beam a File (Send)
            </button>
            <button
              onClick={() => {
                resetAll();
                setMode('receive');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'receive'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Receive File
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SEND MODE */}
        {mode === 'send' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
            {!fileToSend ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-10 text-center cursor-pointer transition-all bg-slate-50/50 hover:bg-blue-50/30 group"
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
                <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                  <UploadCloud size={28} />
                </div>
                <div className="font-bold text-sm text-slate-900">Choose a file to Beam directly</div>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Drag and drop or click to select videos, ZIPs, or documents of any size.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-blue-50/50 border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                      FILE
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{fileToSend.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {(fileToSend.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  {!offerCode && (
                    <button
                      onClick={handleStartSender}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap size={14} /> Start Beam Tunnel
                    </button>
                  )}
                </div>

                {offerCode && (
                  <div className="space-y-4 pt-2">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          Step 1: Share this Tunnel Code with Receiver
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(offerCode);
                            setHasCopiedOffer(true);
                            setTimeout(() => setHasCopiedOffer(false), 2000);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 hover:bg-slate-100"
                        >
                          {hasCopiedOffer ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          <span>{hasCopiedOffer ? 'Copied' : 'Copy Code'}</span>
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={offerCode}
                        rows={3}
                        className="w-full font-mono text-[10px] p-2 bg-white rounded border border-slate-200 text-slate-600 select-all"
                      />
                    </div>

                    {isWaitingAnswer && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <span className="text-xs font-bold text-slate-800 block">
                          Step 2: Paste Receiver&rsquo;s Answer Code
                        </span>
                        <textarea
                          placeholder="Paste the answer code from receiver here..."
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          rows={3}
                          className="w-full font-mono text-[11px] p-2 bg-white rounded border border-slate-300 text-slate-700 outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={handleApplyAnswer}
                          disabled={!answerInput.trim()}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          Connect Tunnel
                        </button>
                      </div>
                    )}

                    {isConnected && !progress && (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900">Tunnel Connected! Ready to beam.</span>
                        <button
                          onClick={handleSendFile}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <Send size={14} /> Beam File Now
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Transfer Progress */}
            {progress && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex justify-between text-xs font-bold text-emerald-900">
                  <span>Streaming DataChannel: {progress.percent}%</span>
                  <span>{progress.speedMBps.toFixed(1)} MB/s</span>
                </div>
                <div className="w-full h-2 rounded-full bg-emerald-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-200"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* RECEIVE MODE */}
        {mode === 'receive' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-5">
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 block">
                Step 1: Paste Sender&rsquo;s Offer Code
              </span>
              <textarea
                placeholder="Paste the tunnel code sent by sender..."
                value={offerInput}
                onChange={(e) => setOfferInput(e.target.value)}
                rows={3}
                className="w-full font-mono text-[11px] p-2 bg-slate-50 rounded-xl border border-slate-300 text-slate-700 outline-none focus:border-blue-500"
              />
              {!generatedAnswer && (
                <button
                  onClick={handleProcessOffer}
                  disabled={!offerInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  Generate Receiver Answer
                </button>
              )}
            </div>

            {generatedAnswer && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Step 2: Send this Answer Code back to Sender
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedAnswer);
                      setHasCopiedAnswer(true);
                      setTimeout(() => setHasCopiedAnswer(false), 2000);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 hover:bg-slate-100"
                  >
                    {hasCopiedAnswer ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    <span>{hasCopiedAnswer ? 'Copied' : 'Copy Answer'}</span>
                  </button>
                </div>
                <textarea
                  readOnly
                  value={generatedAnswer}
                  rows={3}
                  className="w-full font-mono text-[10px] p-2 bg-white rounded border border-slate-200 text-slate-600 select-all"
                />
              </div>
            )}

            {/* Received File Display */}
            {receivedFile && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                    <Check size={14} className="text-emerald-600" /> Transfer Complete!
                  </div>
                  <div className="text-[11px] text-emerald-800 mt-0.5">
                    {receivedFile.name} ({(receivedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </div>
                </div>
                <a
                  href={URL.createObjectURL(receivedFile)}
                  download={receivedFile.name}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-xs"
                >
                  <Download size={14} /> Save to Disk
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
