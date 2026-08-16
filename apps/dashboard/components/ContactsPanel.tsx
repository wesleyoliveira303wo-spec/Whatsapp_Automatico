import { useRef, useState } from 'react';
import { Upload, Users } from 'lucide-react';

import { useContacts } from '@/hooks/useContacts';
import { ClientApiError, type ContactImportReport } from '@/lib/clientApi';
import { formatPhoneNumber, formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import ErrorState from '@/components/states/ErrorState';

interface ContactsPanelProps {
  /** Só administrator/owner veem o botão de importar — a barreira real é `contact:manage` na API. */
  canImport: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  import: 'Planilha',
  manual: 'Manual',
};

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite importar contatos.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    if (error.status === 413) {
      const message = (error.body as { message?: string } | undefined)?.message;
      return message ?? 'A planilha é grande demais.';
    }
  }
  return 'Não foi possível concluir a importação. Tente novamente.';
}

/** Resumo em uma frase do relatório de importação — para o toast de sucesso. */
function summarize(report: ContactImportReport): string {
  const parts: string[] = [];
  if (report.created > 0) parts.push(`${report.created} novo(s)`);
  if (report.enriched > 0) parts.push(`${report.enriched} com nome preenchido`);
  if (report.unchanged > 0) parts.push(`${report.unchanged} já cadastrado(s)`);
  if (report.invalid.length > 0) parts.push(`${report.invalid.length} linha(s) ignorada(s)`);
  return parts.length > 0 ? parts.join(' · ') : 'Nenhuma linha processada.';
}

/**
 * Painel de Contatos (Fase L, Bloco L1b; movido para item próprio do rail a
 * pedido do fundador em 2026-08-15 — antes vivia como aba "Leads" dentro de
 * Configurações) — lista a base de contatos do tenant (`WhatsAppContact`,
 * tenant-wide) e, para quem gerencia, permite importar uma planilha `.csv`
 * (cabeçalho com colunas de nome/telefone). Mesma casca de `TagsPanel.tsx`
 * (busca + lista + Card), sem os controles de edição inline (contatos ainda
 * não têm tela de edição manual — fica para um bloco futuro).
 */
export default function ContactsPanel({ canImport }: ContactsPanelProps): JSX.Element {
  const {
    contacts,
    loading,
    errorMessage,
    hasMore,
    loadingMore,
    loadMore,
    search,
    setSearch,
    refresh,
    importCsv,
  } = useContacts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  /**
   * `FileReader`, não `File.prototype.text()` — deliberado: é o método de
   * leitura de arquivo com o suporte mais amplo (inclusive navegadores mais
   * antigos), e é o único dos dois que o ambiente de teste (jsdom) implementa
   * de fato.
   */
  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
      reader.readAsText(file);
    });
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Sempre limpar o input, mesmo em erro — senão selecionar o MESMO
    // arquivo duas vezes seguidas não dispara `onChange` de novo.
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const csvText = await readFileAsText(file);
      const report = await importCsv(csvText);
      toast({
        variant: 'success',
        title: 'Importação concluída',
        description: summarize(report),
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível importar',
        description: errorMessageFor(error),
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="h-[34px] flex-1 rounded-[9px] border-border bg-panel text-[13px]"
        />
        {canImport && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void handleFileSelected(event)}
            />
            <Button
              type="button"
              size="cta"
              className="shrink-0"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {importing ? 'Importando…' : 'Importar planilha'}
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : errorMessage ? (
        <ErrorState description={errorMessage} onRetry={refresh} />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
          description={
            search
              ? 'Tente buscar por outro nome ou telefone.'
              : canImport
                ? 'Contatos aparecem aqui automaticamente quando alguém escreve no WhatsApp, ou importe uma planilha.'
                : 'Contatos aparecem aqui automaticamente quando alguém escreve no WhatsApp.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {contacts.map((contact, index) => (
            <div
              key={contact.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                index < contacts.length - 1 && 'border-b border-border/70',
              )}
              data-testid={`contact-row-${contact.id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {contact.name ?? formatPhoneNumber(contact.phoneE164)}
                </p>
                {contact.name && (
                  <p className="truncate text-[12px] text-muted-foreground">
                    {formatPhoneNumber(contact.phoneE164)}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[12px] text-muted-foreground">
                {SOURCE_LABELS[contact.source] ?? contact.source}
              </span>
              <span className="shrink-0 text-[12px] text-muted-foreground">
                {formatDateTime(contact.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && !errorMessage && hasMore && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? 'Carregando…' : 'Carregar mais'}
          </Button>
        </div>
      )}
    </div>
  );
}
