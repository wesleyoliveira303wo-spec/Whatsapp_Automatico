import Link from 'next/link';
import { motion } from 'framer-motion';
import { fadeInUp } from '@/lib/motion';
import { Smartphone, ChevronRight } from 'lucide-react';
import StatusBadge from './StatusBadge';
import StatusDot from './StatusDot';
import ContactAvatar from './ContactAvatar';
import { Card } from '@/components/ui/card';
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
 * de status e última atividade. O card inteiro leva ao detalhe
 * (`/sessions/:sessionName`), onde ficam QR Code e ações. Substitui o
 * `SessionListItem` (linha) por um card de grid, mais adequado a um painel de
 * contas.
 *
 * Correção 2026-08-07 (2ª rodada, pedido do fundador): com `phoneNumber`
 * conhecido, o avatar vira a foto de perfil real do WhatsApp conectado
 * (`ContactAvatar`) em vez do ícone genérico de celular colorido por status
 * (`AVATAR_TINT` mantido só como fallback).
 */
export default function WhatsAppAccountCard({
  session,
  waitingCount = 0,
}: WhatsAppAccountCardProps): JSX.Element {
  return (
    <motion.div variants={fadeInUp}>
      <Link href={`/sessions/${encodeURIComponent(session.sessionName)}`} className="group block">
      {/*
        Onda 2 do redesign (2026-08-23) — `hover:-translate-y-0.5` soma um
        leve "levantar" ao border+shadow que já existiam, reforçando que o
        card inteiro é clicável (link para a sessão). `active:translate-y-0`
        cancela o levante no clique, para não "flutuar" durante o próprio
        toque. `duration-200` explícito — sem isso herdaria o `duration-150`
        default do Tailwind, curto demais para um movimento de 2px perceptível.
      */}
      <Card className="flex h-full flex-col gap-4 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-md active:translate-y-0">
        <div className="flex items-start justify-between gap-3">
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
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span>Última atividade: {formatDateTime(session.lastSeen)}</span>
          <span className="flex items-center gap-0.5 text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Gerenciar
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
        </Card>
      </Link>
    </motion.div>
  );
}
