import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, UserCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface CallOverlayProps {
  isIncoming: boolean;
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioOnly?: boolean;
}

// Generate a ring tone using Web Audio API
function createRingTone(ctx: AudioContext): () => void {
  let stopped = false;

  const playNote = (freq: number, start: number, dur: number) => {
    if (stopped) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
    gain.gain.linearRampToValueAtTime(0.35, start + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, start + dur);
    osc.start(start);
    osc.stop(start + dur);
  };

  let timeoutId: ReturnType<typeof setTimeout>;
  const ring = (t: number) => {
    if (stopped) return;
    playNote(1046, t, 0.13);
    playNote(1318, t + 0.18, 0.13);
    playNote(1568, t + 0.36, 0.25);
    timeoutId = setTimeout(() => ring(ctx.currentTime + 0.01), 2200);
  };
  ring(ctx.currentTime + 0.1);

  return () => {
    stopped = true;
    clearTimeout(timeoutId);
    ctx.close().catch(() => { });
  };
}

export default function CallOverlay({
  isIncoming,
  callerName,
  onAccept,
  onReject,
  onHangup,
  localStream,
  remoteStream,
  isAudioOnly = false,
}: CallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const stopRingRef = useRef<(() => void) | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(isAudioOnly);
  const [callDuration, setCallDuration] = useState(0);

  // Ring for incoming call (before answer)
  useEffect(() => {
    if (isIncoming && !localStream) {
      try {
        const ctx = new AudioContext();
        stopRingRef.current = createRingTone(ctx);
      } catch (e) {
        console.warn('Ring audio failed:', e);
      }
    }
    return () => {
      stopRingRef.current?.();
      stopRingRef.current = null;
    };
  }, [isIncoming, localStream]);

  // Timer once remote connects
  useEffect(() => {
    if (!remoteStream) return;
    stopRingRef.current?.();
    const id = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(id);
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
    setIsMuted(m => !m);
  };
  const toggleVideo = () => {
    localStream?.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
    setIsVideoOff(v => !v);
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleReject = () => { stopRingRef.current?.(); onReject(); };
  const handleAccept = () => { stopRingRef.current?.(); onAccept(); };

  // ─────────────────────────────────────────────
  // INCOMING CALL SCREEN (before answering)
  // ─────────────────────────────────────────────
  if (isIncoming && !localStream) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[300] flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #050d05 0%, #001500 60%, #050d05 100%)' }}
      >
        <div className="scanline" />

        {/* Pulsing rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[1, 2, 3].map(i => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-accent/30"
              initial={{ width: 128, height: 128, opacity: 0.5 }}
              animate={{ width: 128 + i * 90, height: 128 + i * 90, opacity: 0 }}
              transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.55, ease: 'easeOut' }}
            />
          ))}
        </div>

        <div className="flex flex-col items-center space-y-8 z-10 px-6 text-center">
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="w-36 h-36 bg-accent/10 border-2 border-accent/30 rounded-full flex items-center justify-center"
          >
            <UserCircle className="w-24 h-24 text-accent/60" />
          </motion.div>

          <div className="space-y-2">
            <h2 className="text-4xl font-mono font-bold text-white tracking-tight">
              {callerName.toUpperCase()}
            </h2>
            <motion.p
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="text-accent font-mono text-sm uppercase tracking-widest"
            >
              {isAudioOnly ? '📞 Входящий аудиозвонок' : '📹 Входящий видеозвонок'}
            </motion.p>
          </div>

          <div className="flex items-center space-x-20 pt-4">
            <div className="flex flex-col items-center space-y-3">
              <button
                onClick={handleReject}
                className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-2xl shadow-red-500/40 active:scale-95"
              >
                <PhoneOff className="w-9 h-9" />
              </button>
              <span className="text-[11px] font-mono text-text-secondary uppercase tracking-wider">Отклонить</span>
            </div>

            <div className="flex flex-col items-center space-y-3">
              <motion.button
                onClick={handleAccept}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                className="w-20 h-20 rounded-full bg-accent flex items-center justify-center text-black hover:bg-accent/90 transition-all shadow-2xl shadow-accent/40 active:scale-95"
              >
                <Phone className="w-9 h-9" />
              </motion.button>
              <span className="text-[11px] font-mono text-accent uppercase tracking-wider">Принять</span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ─────────────────────────────────────────────
  // OUTGOING CALL SCREEN (waiting for answer)
  // ─────────────────────────────────────────────
  if (!isIncoming && localStream && !remoteStream) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[300] flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #050d05 0%, #001500 60%, #050d05 100%)' }}
      >
        <div className="scanline" />

        {/* Pulsing rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[1, 2, 3].map(i => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-accent/20"
              initial={{ width: 128, height: 128, opacity: 0.5 }}
              animate={{ width: 128 + i * 90, height: 128 + i * 90, opacity: 0 }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
            />
          ))}
        </div>

        <div className="flex flex-col items-center space-y-8 z-10 px-6 text-center">
          {/* Local video preview (small, if video call) */}
          {!isAudioOnly && (
            <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-accent/40 bg-surface shadow-2xl">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            </div>
          )}
          {isAudioOnly && (
            <div className="w-36 h-36 bg-accent/10 border-2 border-accent/30 rounded-full flex items-center justify-center">
              <UserCircle className="w-24 h-24 text-accent/60" />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-mono text-text-secondary uppercase tracking-widest">
              {isAudioOnly ? 'Аудиозвонок' : 'Видеозвонок'} → Канал
            </p>
            <h2 className="text-4xl font-mono font-bold text-white tracking-tight">
              #{callerName.toUpperCase()}
            </h2>
            <motion.p
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-accent font-mono text-sm uppercase tracking-widest"
            >
              Вызов... ожидание ответа
            </motion.p>
          </div>

          {/* Hang up */}
          <div className="flex flex-col items-center space-y-3 pt-4">
            <button
              onClick={onHangup}
              className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-2xl shadow-red-500/40 active:scale-95"
            >
              <PhoneOff className="w-9 h-9" />
            </button>
            <span className="text-[11px] font-mono text-text-secondary uppercase tracking-wider">Завершить</span>
          </div>
        </div>
      </motion.div>
    );
  }

  // ─────────────────────────────────────────────
  // ACTIVE CALL SCREEN (connected)
  // ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col">
      <div className="scanline" />

      {/* Main video area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Remote video / audio-only avatar */}
        {remoteStream && !isAudioOnly ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <div className="w-36 h-36 bg-accent/10 border border-accent/20 rounded-full flex items-center justify-center">
              <UserCircle className="w-24 h-24 text-accent/50" />
            </div>
            <h3 className="text-3xl font-mono font-bold text-white tracking-tighter uppercase">{callerName}</h3>
            <p className="text-accent font-mono text-sm animate-pulse">
              {!remoteStream ? 'УСТАНОВКА СОЕДИНЕНИЯ...' : 'АУДИОКАНАЛ АКТИВЕН'}
            </p>
          </div>
        )}

        {/* Hidden audio element for remote audio */}
        {remoteStream && isAudioOnly && (
          <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
        )}

        {/* Local video PIP */}
        {!isAudioOnly && localStream && (
          <div className="absolute bottom-4 right-4 w-36 md:w-52 aspect-video rounded-xl overflow-hidden border border-accent/30 shadow-2xl bg-surface">
            {isVideoOff ? (
              <div className="w-full h-full flex items-center justify-center bg-surface">
                <UserCircle className="w-10 h-10 text-accent/40" />
              </div>
            ) : (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}
            <div className="absolute bottom-1 left-2 text-[9px] font-mono text-white/60">ВЫ</div>
          </div>
        )}

        {/* Top info bar */}
        <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 space-y-0.5">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-mono font-bold text-white">{callerName.toUpperCase()}</span>
          </div>
          {remoteStream && (
            <p className="text-xs font-mono text-accent tracking-widest">{fmt(callDuration)}</p>
          )}
          <p className="text-[10px] font-mono text-text-secondary uppercase">P2P · Зашифровано</p>
        </div>
      </div>

      {/* Controls bar */}
      <div className="bg-black/80 backdrop-blur-md py-6 px-8 flex items-center justify-center space-x-6 border-t border-white/10">
        <div className="flex flex-col items-center space-y-1">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          <span className="text-[9px] font-mono text-white/50 uppercase">{isMuted ? 'Включить' : 'Выкл. микрофон'}</span>
        </div>

        {!isAudioOnly && (
          <div className="flex flex-col items-center space-y-1">
            <button
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all ${isVideoOff ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
            <span className="text-[9px] font-mono text-white/50 uppercase">{isVideoOff ? 'Включить' : 'Выкл. камеру'}</span>
          </div>
        )}

        <div className="flex flex-col items-center space-y-1">
          <button
            onClick={onHangup}
            className="w-16 h-16 rounded-full bg-red-500 border-2 border-red-600 flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 active:scale-95"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
          <span className="text-[9px] font-mono text-white/50 uppercase">Завершить</span>
        </div>
      </div>
    </div>
  );
}
