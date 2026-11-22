import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { isTursoMediaUrl, resolveMediaUrl } from '../lib/mediaStorage';

interface ResolvedVideoPlayerProps {
  src: string;
  className?: string;
}

export default function ResolvedVideoPlayer({ src, className }: ResolvedVideoPlayerProps) {
  const needsResolve = isTursoMediaUrl(src);
  const [resolvedSrc, setResolvedSrc] = useState<string>(needsResolve ? '' : src);
  const [isLoading, setIsLoading] = useState<boolean>(needsResolve);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setHasError(false);

    if (!src) {
      setResolvedSrc('');
      setIsLoading(false);
      return;
    }

    if (!isTursoMediaUrl(src)) {
      setResolvedSrc(src);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    resolveMediaUrl(src)
      .then((url) => {
        if (!cancelled) {
          setResolvedSrc(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar vídeo do Turso:', err);
        if (!cancelled) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (hasError) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-xs text-rose-300 bg-slate-900/90 rounded-xl">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Vídeo indisponível ou já removido do banco.</span>
      </div>
    );
  }

  if (isLoading || !resolvedSrc) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-xs text-slate-300 bg-slate-900/80 rounded-xl">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
        <span>Carregando vídeo...</span>
      </div>
    );
  }

  return (
    <video
      src={resolvedSrc}
      controls
      preload="metadata"
      onError={() => setHasError(true)}
      className={className || 'w-full max-h-64 object-contain rounded-xl'}
    />
  );
}
