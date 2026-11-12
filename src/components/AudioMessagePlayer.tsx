import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Trash2, Download, AlertCircle, Lock, Unlock, CheckCircle2, Music, Sparkles } from 'lucide-react';
import { downloadMediaFile } from '../lib/studioService';

interface AudioMessagePlayerProps {
  key?: React.Key;
  audioUrl: string;
  duration?: number;
  isMe?: boolean;
  onDelete?: () => void;
  canDelete?: boolean;
  // Studio Exclusive Delivery / Download Lock Props
  isStudioDelivery?: boolean;
  downloadUnlocked?: boolean;
  title?: string;
  onUnlock?: () => void;
  canUnlock?: boolean; // True for sellers/atendentes
  downloadUrl?: string | null;
  fileName?: string;
}

export default function AudioMessagePlayer({
  audioUrl,
  duration: initialDuration,
  isMe = false,
  onDelete,
  canDelete = false,
  isStudioDelivery = false,
  downloadUnlocked = false,
  title,
  onUnlock,
  canUnlock = false,
  downloadUrl,
  fileName,
}: AudioMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isError, setIsError] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(Boolean(downloadUnlocked));

  useEffect(() => {
    setIsUnlocked(Boolean(downloadUnlocked));
  }, [downloadUnlocked]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.src = audioUrl;
    audio.preload = 'metadata';

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setIsError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.src = '';
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current || isError) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn('Erro ao reproduzir áudio:', err);
        setIsError(true);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isError) {
    return (
      <div className={`flex items-center gap-2 p-2.5 rounded-xl text-xs ${
        isMe ? 'bg-indigo-700/60 text-indigo-100' : 'bg-rose-50 text-rose-700 border border-rose-200'
      }`}>
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-300" />
        <span className="grow">Áudio indisponível ou expirado</span>
        {canDelete && onDelete && (
          <button
            onClick={onDelete}
            title="Remover áudio do chamado"
            className="p-1 hover:text-rose-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 p-2 rounded-xl select-none min-w-[210px] sm:min-w-[240px] max-w-full ${
      isMe ? 'text-white' : 'text-slate-800'
    }`}>
      {/* Top controls row: Play button, waveform/slider, speed, delete */}
      <div className="flex items-center gap-2.5">
        {/* Play / Pause button */}
        <button
          type="button"
          onClick={togglePlay}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm cursor-pointer ${
            isMe
              ? 'bg-white text-indigo-700 hover:bg-indigo-50'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
          title={isPlaying ? 'Pausar áudio' : 'Ouvir áudio'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current translate-x-0.5" />
          )}
        </button>

        {/* Progress & Waveform Slider */}
        <div className="grow flex flex-col justify-center gap-1">
          {/* Simulated waveform bars animated when playing */}
          <div className="flex items-center gap-0.5 h-4 px-0.5 overflow-hidden">
            {[40, 75, 55, 90, 60, 30, 85, 100, 45, 65, 80, 50, 95, 70, 35, 80, 60, 90, 50, 70].map((h, i) => {
              const barPercent = (i / 20) * 100;
              const isPast = progressPercent >= barPercent;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isPast
                      ? isMe ? 'bg-white' : 'bg-indigo-600'
                      : isMe ? 'bg-white/35' : 'bg-slate-300'
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(20, (h * (0.6 + Math.random() * 0.4)))}%` : `${h}%`
                  }}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 accent-indigo-500 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            title="Avançar ou retroceder áudio"
          />
        </div>

        {/* Playback speed toggle */}
        <button
          type="button"
          onClick={cycleSpeed}
          title="Alterar velocidade de reprodução"
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition-colors shrink-0 cursor-pointer ${
            isMe
              ? 'bg-white/20 text-white hover:bg-white/30'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          {playbackRate}x
        </button>

        {/* Optional delete button for seller / master */}
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Remover este áudio do banco de dados"
            className={`p-1 rounded transition-colors shrink-0 cursor-pointer ${
              isMe ? 'hover:text-rose-200 text-white/70' : 'text-slate-400 hover:text-rose-600'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Bottom meta row: current time / total duration */}
      <div className={`flex items-center justify-between text-[10px] font-mono px-1 ${
        isMe ? 'text-indigo-200' : 'text-slate-400'
      }`}>
        <span className="flex items-center gap-1">
          {isStudioDelivery ? (
            <Sparkles className="w-3 h-3 text-amber-500" />
          ) : (
            <Volume2 className="w-3 h-3 opacity-70" />
          )}
          <span>{title || (isStudioDelivery ? 'Gravação Produtora Bossa' : 'Mensagem de Voz')}</span>
        </span>
        <span>
          {formatSeconds(currentTime)} / {formatSeconds(duration || 0)}
        </span>
      </div>

      {/* STUDIO EXCLUSIVE: Prévia / Liberação de Download (Banco Turso bossa) */}
      {isStudioDelivery && (
        <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-col gap-1.5">
          {(isUnlocked || downloadUnlocked) ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-[11px] font-bold text-emerald-900 leading-tight truncate">
                    Material Aprovado & Pago!
                  </p>
                  <p className="text-[10px] text-emerald-700 truncate">
                    Download liberado pela Produtora
                  </p>
                </div>
              </div>

              {/* Botão de Download liberado diretamente para o cliente */}
              <button
                type="button"
                onClick={() => downloadMediaFile(downloadUrl || audioUrl, fileName || 'Audio_Final_Bossa.mp3')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
                title="Baixar arquivo final de áudio em alta qualidade"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Áudio</span>
              </button>
            </div>
          ) : (
            <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-md bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-amber-800 flex items-center gap-1">
                    <span>Modo Prévia de Estúdio</span>
                    <span className="text-[9px] px-1 py-0.2 bg-amber-200 text-amber-900 rounded font-bold">Turso</span>
                  </span>
                  <p className="text-[11px] text-amber-950 font-medium leading-tight">
                    Ouça a demonstração. O download será liberado após o pagamento.
                  </p>
                </div>
              </div>

              {/* Se for o Atendente/Produtor da Bossa: exibe botão para desbloquear com 1 clique */}
              {canUnlock && onUnlock && (
                <button
                  type="button"
                  onClick={onUnlock}
                  className="w-full sm:w-auto px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 cursor-pointer active:scale-95"
                  title="Clique após receber o pagamento para liberar o botão de download para o cliente"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Liberar Download (Pago)</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
