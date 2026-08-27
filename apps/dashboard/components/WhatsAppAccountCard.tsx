import Link from 'next/link';
import { motion } from 'framer-motion';
import { fadeInUp } from '@/lib/motion';
import { Smartphone, ChevronRight } from 'lucide-react';
import StatusBadge from './StatusBadge';
import StatusDot from './StatusDot';
import ContactAvatar from './ContactAvatar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';
import type { WhatsAppSessionSummary } from '@/lib/clientApi';

interface WhatsAppAccountCardProps {
  session: WhatsAppSessionSummary;
  /** Milestone 6, Bloco M6H-1 — conversas aguardando atendimento humano NESTA sessão (ver `useWaitingForHuman`). */
  waitingCount?: number;
}

/** Tom do avatar por status (contrato de cor, PRODUCT_PRINCIPLES.md §2.3). */
const AVATAR_TINT: Record<WhatsAppSessionSummary['status'], string> = {
  connected: 'bg-success/10 text-success',
  connecting: 'bg-warning/10 text-warning',
  disconnected: 'bg-muted text-muted-foreground',
};

/**
 * Milestone 6, Bloco M6G — card de uma conta de WhatsApp no dashboard. Objeto
 * central da tela: avatar colorido por status, nome da conexão, número, selo
 * de status e última atividade.
 *
 * Correção 2026-08-07 (2ª rodada, pedido do fundador): com `phoneNumber`
 * conhecido, o avatar vira a foto de perfil real do WhatsApp conectado
 * (`ContactAvatar`) em vez do ícone genérico de celular colorido por status
 * (`AVATAR_TINT` mantido só como fallback).
 *
 * CORREÇÃO 2026-08-27 (pedido do fundador): "Gerenciar" era texto sublinhado
 * revelado só no hover, dentro do MESMO `<Link>` que o card inteiro (que
 * entra na sessão) — parecia clicável mas era só decoração, e um `<a>`
 * dentro de outro `<a>` é HTML inválido de qualquer forma (Web Interface
 * Guidelines: nunca aninhar elementos interativos). Agora são DOIS alvos de
 * clique DISTINTOS, lado a lado (nunca aninhados): a área de cima (avatar/
 * nome/número/status) ENTRA na sessão — Dashboard completo, mesmo destino de
 * sempre; "Gerenciar" é um botão de verdade (`Button asChild`, sempre
 * visível, sem depender de hover para ser descoberto) que leva à DESCRIÇÃO
 * daquela conexão (`/sessions/:s/settings?tab=whatsapps&session=:s` — status,
 * QR, histórico, conectar/desconectar).
 */
export default function WhatsAppAccountCard({
  session,
  waitingCount = 0,
}: WhatsAppAccountCardProps): JSX.Element {
  const encodedName = encodeURIComponent(session.sessionName);
  const enterHref = `/sessions/${encodedName}`;
  const manageHref = `/sessions/${encodedName}/settings?tab=whatsapps&session=${encodedName}`;

  return (
    <motion.div variants={fadeInUp}>
      <Card className="flex h-full flex-col gap-4 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
        <Link
          href={enterHref}
          className="flex items-start justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Entrar em ${session.sessionName}`}
        >
          <div className="flex items-center gap-3">
            {session.phoneNumber ? (
              <ContactAvatar
                sessionName={session.sessionName}
                contactJid={`${session.phoneNumber}@s.whatsapp.net`}
                className="h-11 w-11 text-sm"
              />
            ) : (
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                  AVATAR_TINT[session.status],
                )}
              >
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                <StatusDot status={session.status} />
                {session.sessionName}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {session.phoneNumber ?? 'Número ainda não vinculado'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {waitingCount > 0 && (
              <span
                className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-destructive-foreground"
                title={`${waitingCount} conversa(s) aguardando atendimento humano`}
              >
                {waitingCount}
              </span>
            )}
            <StatusBadge status={session.status} />
          </div>
        </Link>

        <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            Última atividade: {formatDateTime(session.lastSeen)}
          </span>
          <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs">
            <Link href={manageHref}>
              Gerenciar
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
