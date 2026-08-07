import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';

/**
 * Milestone 6, Bloco M6C-3 (ADR #62) — renderiza a fila de toasts. Montado
 * UMA vez em `_app.tsx` (fora de qualquer página específica, mesmo racional
 * do `<Head>` padrão da M6B) — qualquer chamada a `toast(...)` de qualquer
 * lugar do app aparece aqui.
 */
export function Toaster(): JSX.Element {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
