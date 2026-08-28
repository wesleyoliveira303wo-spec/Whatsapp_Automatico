import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import MessageMeta from './MessageMeta';
import type { MessageDeliveryStatus } from './MessageStatus';

interface MessageAudioPlayerProps {
  src: string;
  className?: string;
  /** Reskin 2026-08-27 — direção da mensagem; muda a cor da trilha de progresso. */
  outbound?: boolean;
  /** Reskin 2026-08-27 — horário exibido dentro da própria moldura do áudio (nunca abaixo dela). */
  occurredAt?: string;
  /** Reskin 2026-08-27 — indicador de entrega, só em mensagens enviadas. */
  status?: MessageDeliveryStatus;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—:—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Número de barras da waveform — mesma densidade visual da referência. */
const WAVEFORM_BAR_COUNT = 32;

/**
 * Alturas das barras da waveform, em porcentagem (30%–100%).
 *
 * DECORATIVO quanto à AMPLITUDE, por limitação real: a API entrega o
 * binário do áudio, não os samples decodificados — desenhar a forma de onda
 * verdadeira exigiria decodificar o arquivo inteiro no cliente (Web Audio
 * API) só para pintar 32 barrinhas. O PROGRESSO, esse sim, é real (vem do
 * `currentTime` do `<audio>`).
 *
 * Derivadas do `src` por um PRNG determinístico (LCG clássico) para que a
 * mesma mensagem tenha sempre o mesmo desenho — uma waveform que muda a cada
 * render pareceria defeito.
 */
function waveformHeights(seed: string, bars: number): number[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state = (state * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const heights: number[] = [];
  for (let index = 0; index < bars; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    heights.push(30 + ((state >>> 8) % 71));
  }
  return heights;
}

/**
 * Reskin 2026-08-06 — player de áudio da bolha de mensagem, no lugar do
 * `<audio controls>` nativo (que não tem como ser restilizado de forma
 * confiável entre navegadores). Continua sendo o MESMO elemento `<audio>`
 * por baixo (via ref, sem chrome nativo) — reprodução real, progresso e
 * duração reais via `timeupdate`/`loadedmetadata`, não decorativos.
 *
 * Reskin 2026-08-27 — a linha de progresso fina virou a waveform em barras
 * da referência. Amplitude decorativa e determinística (ver
 * `waveformHeights`); progresso real. Sem busca por clique na trilha —
 * fora de escopo, e a referência também não interage com ela.
 */
export default function MessageAudioPlayer({
  src,
  className,
  outbound = false,
  occurredAt,
  status,
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

  // `useMemo` não é necessário: `waveformHeights` é O(32) e o componente só
  // re-renderiza a cada `timeupdate` — o custo é irrelevante e a alternativa
  // acrescentaria um hook para nada.
  const heights = waveformHeights(src, WAVEFORM_BAR_COUNT);
  const playedBars = Math.round((progressPct / 100) * WAVEFORM_BAR_COUNT);

  return (
    <div
      className={cn(
        'flex items-center gap-[11px] rounded-xl px-[13px] py-[9px] pl-2.5',
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
      <span className="flex h-[26px] min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden="true">
        {heights.map((height, index) => (
          <span
            key={index}
            data-waveform-bar
            style={{ height: `${height}%` }}
            className={cn(
              'w-[2px] shrink-0 rounded-full',
              index < playedBars
                ? outbound
                  ? 'bg-chat-bubble-out-foreground/70'
                  : 'bg-primary'
                : 'bg-chat-meta/40',
            )}
          />
        ))}
      </span>
      <span className="shrink-0 text-[11.5px] tabular-nums text-chat-meta">
        {formatDuration(duration > 0 ? duration - currentTime : duration)}
      </span>
      {occurredAt && <MessageMeta occurredAt={occurredAt} status={status} />}
    </div>
  );
}
