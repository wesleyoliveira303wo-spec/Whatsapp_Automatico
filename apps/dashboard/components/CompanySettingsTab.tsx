import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchTenant, updateTenantName, ClientApiError } from '@/lib/clientApi';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Aba "Empresa" de Configurações (Reorganização Perfil/Configurações,
 * 2026-08-27) — hoje só o nome do tenant, único dado de `Tenant` com
 * consumidor de UI (`GET/PATCH /api/tenant`). Edição exige `tenant:manage`
 * (hoje só OWNER) — a API responde 403 para os demais, tratado como
 * somente-leitura na tela (sem botão de salvar).
 */
export default function CompanySettingsTab({ canManage }: { canManage: boolean }): JSX.Element {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTenant()
      .then(({ tenant }) => {
        if (!cancelled) setName(tenant.name);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Não foi possível carregar os dados da empresa.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (name.trim() === '') return;

    setSubmitting(true);
    try {
      const { tenant } = await updateTenantName(name.trim());
      setName(tenant.name);
      setSuccessMessage('Nome da empresa atualizado.');
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 403) {
        setErrorMessage('Só o dono da conta pode alterar o nome da empresa.');
      } else {
        setErrorMessage('Não foi possível salvar. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-24 w-full max-w-md rounded-xl" />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="companyName" className="text-sm font-medium text-foreground">
          Nome da empresa
        </label>
        <Input
          id="companyName"
          name="organization"
          autoComplete="organization"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canManage}
          required
        />
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            Só o dono da conta pode alterar o nome da empresa.
          </p>
        )}
      </div>

      {errorMessage && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success"
        >
          {successMessage}
        </p>
      )}

      {canManage && (
        <Button type="submit" disabled={submitting} className="w-fit">
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitting ? 'Salvando…' : 'Salvar'}
        </Button>
      )}
    </form>
  );
}
