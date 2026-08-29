import { useRef, useState, type ChangeEvent } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { resizeImageToDataUrl } from '@/lib/imageResize';
import { cn } from '@/lib/utils';

interface EditableAvatarProps {
  email: string;
  name?: string;
  avatarUrl?: string;
  className?: string;
  /** Recebe a `data:image/jpeg;base64,...` já recortada/comprimida — quem chama decide como salvar (e trata o erro de salvar). */
  onChange: (dataUrl: string) => Promise<void>;
}

/**
 * Avatar do Perfil com upload de foto de verdade (Auditoria do Perfil,
 * 2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 4) — substitui o campo de
 * texto "URL da foto" (achado real: colar um link é péssima experiência
 * pra "minha foto de perfil"). Padrão do mercado (Slack/Linear/GitHub):
 * passar o mouse sobre o círculo escurece e mostra um lápis; clicar abre o
 * seletor de arquivo do sistema operacional.
 *
 * O recorte/compressão acontece em `lib/imageResize.ts` (client-side, sem
 * dependência nova) — este componente só orquestra: escolheu arquivo →
 * processa → chama `onChange` com o resultado pronto para salvar. Estado
 * de erro é DESTE componente (não do formulário de nome ao lado, upload é
 * uma ação independente, salva sozinha, sem precisar do botão "Salvar").
 */
export default function EditableAvatar({
  email,
  name,
  avatarUrl,
  className,
  onChange,
}: EditableAvatarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Sempre limpa o `<input>` — mesmo arquivo escolhido duas vezes seguidas
    // (ex.: corrigir depois de um erro) não dispara `onChange` de novo sem isto.
    event.target.value = '';
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await onChange(dataUrl);
    } catch (caught) {
      // `ImageResizeError` (processamento local) e o erro que `onChange`
      // rejeitar (salvar na API) já vêm com mensagem pronta pra exibir;
      // só um throw sem `Error` de verdade cai no genérico.
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível salvar a foto. Tente novamente.',
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Trocar foto de perfil"
        className={cn(
          'group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait',
          className,
        )}
      >
        <UserAvatar email={email} name={name} avatarUrl={avatarUrl} className="h-14 w-14 text-base" />
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-all duration-150 group-hover:bg-black/50 group-hover:opacity-100 group-focus-visible:bg-black/50 group-focus-visible:opacity-100',
            uploading && 'bg-black/50 opacity-100',
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Pencil className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void handleFileSelected(event)}
      />
      {error && (
        <p role="alert" aria-live="polite" className="max-w-[10rem] text-[11.5px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
