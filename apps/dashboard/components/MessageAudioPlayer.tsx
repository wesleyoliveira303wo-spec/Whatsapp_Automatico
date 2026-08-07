import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageAudioPlayerProps {
  src: string;
  className?: string;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—:—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Reskin 2026-08-06 — player de áudio da bolha de mensagem, no lugar do
 * `<audio controls>` nativo (que não tem como ser restilizado de forma
 * confiável entre navegadores). Continua sendo o MESMO elemento `<audio>`
 * por baixo (via ref, sem chrome nativo) — reprodução real, progresso e
 * duração reais via `timeupdate`/`loadedmetadata`, não decorativos. Sem
 * busca por clique na trilha (fora do escopo deste reskin; o mockup também
 * não interage com a trilha).
 */
export default function MessageAudioPlayer({
  src,
  className,
}: MessageAudioPlayerProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = (): void => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = (): void => setDuration(audio.duration);
    const handleEnded = (): void => setPlaying(false);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  function toggle(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
    setPlaying(!playing);
  }

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className={cn(
        'flex max-w-[66%] items-center gap-[11px] rounded-xl px-[13px] py-[9px] pl-2.5',
        className,
      )}
    >
      <audio ref={audioRef} src={src} className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-sm hover:bg-muted"
      >
        {playing ? (
          <Pause className="h-[13px] w-[13px]" fill="currentColor" aria-hidden="true" />
        ) : (
          <Play className="h-[13px] w-[13px]" fill="currentColor" aria-hidden="true" />
        )}
      </button>
      <span className="relative h-[3px] w-[132px] shrink-0 rounded-full bg-current/[.14]">
        <span
          className="absolute left-0 top-0 h-[3px] rounded-full bg-primary"
          style={{ width: `${progressPct}%` }}
        />
      </span>
      <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
        {formatDuration(duration > 0 ? duration - currentTime : duration)}
      </span>
    </div>
  );
}
