/**
 * Alertas de navegador para a feature de notificação (N2): um som curto e uma
 * notificação nativa quando uma conversa entra na fila de "aguardando humano".
 * Sem dependências e sem assets — o som é sintetizado via Web Audio API. Tudo
 * degrada em silêncio se a API não existir/for bloqueada (SSR, permissão
 * negada), nunca lança.
 */

/** Pede permissão de notificação do navegador (idempotente). Chamar cedo, ex.: ao montar a Sidebar. */
export function ensureNotificationPermission(): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => undefined);
  }
}

/** Toca um bipe curto (Web Audio) — dois tons rápidos, discreto o bastante para ambiente de trabalho. */
export function playAlertSound(): void {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const play = (freq: number, startAt: number, duration: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + duration);
    };
    play(880, 0, 0.18);
    play(1174, 0.2, 0.22);
    // Fecha o contexto depois que os tons terminam, para não vazar recursos.
    window.setTimeout(() => void ctx.close().catch(() => undefined), 700);
  } catch {
    /* silencioso — áudio é um extra, nunca crítico */
  }
}

/** Mostra uma notificação nativa do navegador, se permitida. */
export function showBrowserNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    // eslint-disable-next-line no-new
    new Notification(title, { body });
  } catch {
    /* silencioso */
  }
}
