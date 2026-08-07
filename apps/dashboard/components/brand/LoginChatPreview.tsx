import { Check } from 'lucide-react';
import { BRAND } from '@/lib/brand';

/**
 * Milestone 6, Bloco M6F (revisão) — mockup de conversa para a lateral do
 * login. Peça de branding: comunica os três pilares do produto num relance —
 * WhatsApp (as bolhas), IA (o selo "IA" na resposta) e atendimento resolvido
 * (o indicador de "digitando" + o check de entregue).
 *
 * Decisão de Product Design: vetor/HTML nativo em vez de ilustração raster
 * gerada — nítido em qualquer densidade de tela, sem custo de carregamento de
 * imagem, temável pelos tokens e coerente com a marca v1 (SVG-only, ADR #63).
 * Puramente decorativo (`aria-hidden`) — não é conteúdo que o leitor de tela
 * precise anunciar; a proposta de valor já está no headline e nos benefícios
 * ao lado.
 */
export default function LoginChatPreview(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-xs rounded-2xl bg-card p-4 shadow-xl ring-1 ring-border"
    >
      <div className="mb-3 flex items-center gap-2.5 border-b border-border pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          MC
        </div>
        <div className="leading-tight">
          <p className="text-sm font-medium text-foreground">Maria Costa</p>
          <p className="text-[11px] text-muted-foreground">via WhatsApp</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-[13px] text-foreground">
          Oi! Vocês entregam ainda hoje?
        </div>

        <div className="max-w-[85%] self-end">
          <div className="mb-1 flex items-center justify-end gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
              {BRAND.assistantName} · IA
            </span>
          </div>
          <div className="rounded-2xl rounded-br-md bg-primary px-3 py-2 text-[13px] text-primary-foreground">
            Entregamos sim, até as 18h. Qual seu bairro? 🛵
            <span className="ml-1 inline-flex translate-y-0.5 text-primary-foreground/70">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-md bg-muted px-3 py-2.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
