import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Trash2, Download, AlertCircle } from 'lucide-react';

interface AudioMessagePlayerProps {
  audioUrl: string;
  duration?: number;
  isMe?: boolean;
  onDelete?: () => void;
  canDelete?: boolean;
}

export default function AudioMessagePlayer({
  audioUrl,
  duration: initialDuration,
  isMe = false,
  onDelete,
  canDelete = false,
}: AudioMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isError, setIsError] = useState(false);

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
          <Volume2 className="w-3 h-3 opacity-70" />
          <span>Mensagem de Voz</span>
        </span>
        <span>
          {formatSeconds(currentTime)} / {formatSeconds(duration || 0)}
        </span>
      </div>
    </div>
  );
}
