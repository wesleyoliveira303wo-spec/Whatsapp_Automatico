import { Power } from 'lucide-react';
import { useAiToggleContext } from '@/contexts/AiToggleContext';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Botão POWER (Fase 1, 2026-08-07, pedido do fundador) — liga/desliga a
 * resposta AUTOMÁTICA da IA para novas mensagens desta sessão, sem
 * desconectar o WhatsApp, sem pausar a Dashboard, sem afetar Pipeline/
 * Analytics/histórico. Controla EXCLUSIVAMENTE a capacidade da IA de
 * responder — ver `shouldAutoRespond`/`AiAvailabilityRepository`
 * (`apps/api`) para onde isso é de fato aplicado no backend; este componente
 * só reflete/propõe o estado (fonte de verdade é o servidor, via
 * `useAiToggle`).
 *
 * Minimalista de propósito (pedido explícito): ícone Power (símbolo
 * universal) + um rótulo curto, dentro de uma pílula discreta — verde
 * quando ligado, vermelha quando desligado. Enquanto o estado inicial não
 * chegou, mostra um `Skeleton` (nunca um estado "adivinhado").
 *
 * Correção 2026-08-07 (2ª rodada) — lê o estado via `useAiToggleContext`
 * (compartilhado com `ConversationInbox`, ver `contexts/AiToggleContext.tsx`
 * e `SessionLayout`), não mais um `useAiToggle(sessionName)` próprio — sem
 * isso, clicar aqui não refletia nos selos das conversas até um F5.
 */
export default function AiPowerToggle(): JSX.Element {
  const { aiEnabled, loading, toggle } = useAiToggleContext();

  if (loading || aiEnabled === null) {
    return <Skeleton className="h-[26px] w-[190px] rounded-full" />;
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={aiEnabled}
      title={
        aiEnabled ? 'Clique para desligar a IA desta sessão' : 'Clique para ligar a IA desta sessão'
      }
      className={cn(
        'flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
        aiEnabled
          ? 'border-success/25 bg-success/10 text-success-emphasis hover:bg-success/[.16]'
          : 'border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/[.16]',
      )}
    >
      <Power
        className={cn('h-3.5 w-3.5', aiEnabled ? 'text-success' : 'text-destructive')}
        aria-hidden="true"
      />
      {aiEnabled ? 'IA aguardando novas mensagens' : 'IA desativada'}
    </button>
  );
}
