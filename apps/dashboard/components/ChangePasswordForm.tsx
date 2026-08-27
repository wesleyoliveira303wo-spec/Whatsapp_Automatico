import { useState, type FormEvent } from 'react';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { changePassword, ClientApiError } from '@/lib/clientApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MIN_PASSWORD_LENGTH = 8;

interface ChangePasswordFormProps {
  /** Mostra o aviso de senha provisória (só faz sentido na entrada obrigatória). */
  mustChange?: boolean;
  /** Chamado depois do 204 da API — cada tela decide o que fazer (redirecionar, mostrar mensagem). */
  onSuccess: () => void;
}

/**
 * Formulário de troca da própria senha — extraído de `pages/change-password.tsx`
 * (Reorganização Perfil/Configurações, 2026-08-27) para ser reaproveitado
 * também na aba Segurança do Perfil, sem duplicar a lógica (validação,
 * mensagens de erro, mostrar/ocultar senha). Comportamento IDÊNTICO ao de
 * antes — só a casca (card/redirect) muda por chamador.
 */
export default function ChangePasswordForm({
  mustChange = false,
  onSuccess,
}: ChangePasswordFormProps): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('A confirmação não confere com a nova senha.');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess();
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 401) {
        setErrorMessage('Senha atual incorreta.');
      } else if (error instanceof ClientApiError && error.status === 422) {
        setErrorMessage(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      } else {
        setErrorMessage('Não foi possível trocar a senha. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const passwordFieldType = showPasswords ? 'text' : 'password';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {mustChange && (
        <p className="text-sm text-muted-foreground">
          Sua senha atual é provisória. Defina uma nova senha para continuar.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="currentPassword" className="text-sm font-medium text-foreground">
          Senha atual
        </label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="currentPassword"
            type={passwordFieldType}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="pl-9"
            autoComplete="current-password"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="newPassword" className="text-sm font-medium text-foreground">
          Nova senha
        </label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="newPassword"
            type={passwordFieldType}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="px-9"
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPasswords((current) => !current)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
          >
            {showPasswords ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
          Confirmar nova senha
        </label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="confirmPassword"
            type={passwordFieldType}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="pl-9"
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      {errorMessage && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitting ? 'Salvando…' : 'Salvar nova senha'}
      </Button>
    </form>
  );
}
