import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Send } from 'lucide-react';

import { fetchCampaigns, type Campaign, type CampaignStatus } from '@/lib/clientApi';
import { formatDateTime } from '@/lib/formatters';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import ErrorState from '@/components/states/ErrorState';

interface CampaignsPanelProps {
  sessionName: string;
}

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Em execução',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_BADGE_VARIANT: Record<CampaignStatus, 'secondary' | 'success' | 'warning' | 'default' | 'destructive'> = {
  draft: 'secondary',
  scheduled: 'secondary',
  running: 'success',
  paused: 'warning',
  completed: 'default',
  cancelled: 'destructive',
};

/**
 * Lista de campanhas de uma sessão — Fase L, Blocos L3/L4. Ponto de entrada
 * a partir de "Disparos / Campanhas" na tela de Contatos.
 */
export default function CampaignsPanel({ sessionName }: CampaignsPanelProps): JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    fetchCampaigns({ limit: 50 })
      .then((page) => setCampaigns(page.campaigns.filter((c) => c.sessionName === sessionName)))
      .catch(() => setErrorMessage('Não foi possível carregar as campanhas.'))
      .finally(() => setLoading(false));
  }, [sessionName]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
        Disparos / Campanhas
      </h1>
      <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
        Campanhas criadas nesta sessão — para criar uma nova, selecione contatos na tela{' '}
        <Link
          href={`/sessions/${encodeURIComponent(sessionName)}/contacts`}
          className="text-primary underline"
        >
          Contatos
        </Link>
        .
      </p>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : errorMessage ? (
        <ErrorState description={errorMessage} onRetry={load} />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Nenhuma campanha ainda"
          description="Crie uma na tela de Contatos, selecionando quem deve receber."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {campaigns.map((campaign, index) => (
            <Link
              key={campaign.id}
              href={`/sessions/${encodeURIComponent(sessionName)}/campaigns/${encodeURIComponent(campaign.id)}`}
              className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 ${
                index < campaigns.length - 1 ? 'border-b border-border/70' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">{campaign.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  Criada em {formatDateTime(campaign.createdAt)}
                </p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[campaign.status]} className="shrink-0">
                {STATUS_LABELS[campaign.status]}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
