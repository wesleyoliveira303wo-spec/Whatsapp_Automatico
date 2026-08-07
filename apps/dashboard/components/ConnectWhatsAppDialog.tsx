import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import CreateSessionForm from '@/components/CreateSessionForm';

interface ConnectWhatsAppDialogProps {
  /** Elemento que abre o diálogo (ex.: um `Button`). Renderizado via `asChild`. */
  trigger: ReactNode;
}

/**
 * Milestone 6, Bloco M6G — diálogo de "Conectar WhatsApp". Encapsula o
 * `CreateSessionForm` num `Dialog` (padrão da marca) e é reutilizado em dois
 * pontos do dashboard: o botão do cabeçalho e o CTA do estado vazio. O
 * formulário navega para o detalhe da sessão ao enviar, então o diálogo se
 * desmonta sozinho — `onSubmitted` fecha o estado por garantia.
 */
export default function ConnectWhatsAppDialog({
  trigger,
}: ConnectWhatsAppDialogProps): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar um WhatsApp</DialogTitle>
          <DialogDescription>
            Dê um nome à conexão. No próximo passo você escaneia o QR Code no celular.
          </DialogDescription>
        </DialogHeader>
        <CreateSessionForm onSubmitted={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
