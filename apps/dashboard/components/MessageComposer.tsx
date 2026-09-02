import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  Plus,
  X,
  FileText,
  MessageSquareText,
  Send,
  Settings2,
  ChevronLeft,
} from 'lucide-react';
import { sendConversationMessage, sendConversationMedia, ClientApiError } from '@/lib/clientApi';
import { useQuickReplies } from '@/hooks/useQuickReplies';
import { useIsFreePlan } from '@/contexts/PlanContext';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import QuickRepliesPanel from '@/components/QuickRepliesPanel';

interface MessageComposerProps {
  conversationId: string;
  /** Sessão do WhatsApp desta conversa — usada para buscar as Respostas Rápidas da sessão (Fase 1, Bloco F1.9). */
  sessionName: string;
  /** Chamado após um envio aceito (202) — a página usa para forçar um refresh imediato da timeline. */
  onSent: () => void;
}

const MAX_LENGTH = 4096;

/**
 * Teto de tamanho do lado do CLIENTE (Fase 1, Bloco F1.3) — puramente uma
 * conveniência de UX (falha rápido, sem esperar o upload inteiro terminar
 * para descobrir que vai ser rejeitado). O teto de VERDADE é imposto pela
 * API (`MAX_AGENT_MEDIA_UPLOAD_BYTES`, `413`) — este valor é só um espelho
 * dele, não a fonte de verdade.
 */
const MAX_CLIENT_FILE_BYTES = 16 * 1024 * 1024;

/** Deriva a categoria do Domain (`image`/`audio`/`video`/`document`) a partir do `File.type` (MIME) — mesmo vocabulário de `MessageContentType`, exceto `text`/`sticker` (não aplicáveis a upload manual). */
function mediaContentTypeFor(file: File): 'image' | 'audio' | 'video' | 'document' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'conversation_not_human') return 'Assuma a conversa antes de responder.';
    if (code === 'conversation_forbidden') return 'Esta conversa foi assumida por outra pessoa.';
    if (code === 'agent_media_too_large') return 'Arquivo grande demais para enviar.';
    if (code === 'whatsapp_not_connected')
      return 'WhatsApp desconectado — não foi possível enviar agora.';
    if (error.status === 403) return 'Seu cargo não permite enviar mensagens.';
    if (error.status === 401) return 'Sessão expirada. Entre novamente.';
  }
  return 'Não foi possível enviar. Tente novamente.';
}

/**
 * Caixa de resposta do operador (feature N2). Aparece só quando a conversa está
 * em "human" (o operador assumiu). Envia texto via a API (202 enfileirado) e
 * chama `onSent` para a página atualizar a timeline na hora — a mensagem
 * enviada aparece assim que o consumer a entrega e o tempo real (N2-4) a
 * traz. Enter envia; Shift+Enter quebra linha.
 *
 * Fase 1, Bloco F1.3: ganhou anexo de mídia (imagem/áudio/vídeo/documento) —
 * paridade mínima com o WhatsApp Web (`FASE_1_ANALISE_ESTRATEGICA.md` F1.3).
 * Diferente do envio de texto, o envio de mídia é SÍNCRONO (200, não 202) —
 * `onSent()` só é chamado após a confirmação, e qualquer falha aparece na
 * hora via toast (o operador está esperando, não faz sentido um "enfileirado"
 * silencioso para um upload que ele mesmo iniciou).
 *
 * Milestone 6, Bloco M6E-2: erro de envio migrado para `Toast` (antes era
 * banner inline) — este é o caminho crítico mobile (USER_JOURNEY.md §6);
 * o toast não ocupa espaço fixo na caixa de resposta, importante numa tela
 * pequena.
 *
 * Fase 1, Bloco F1.9: botão de Respostas Rápidas (ícone ao lado do de
 * anexo) abre um dropdown local com as frases cadastradas na sessão
 * (`useQuickReplies`); clicar insere o texto no campo (acrescenta com espaço
 * se já houver algo digitado) e fecha o dropdown.
 *
 * Redesign 2026-08-25: o mesmo dropdown ganhou um modo "Gerenciar" — antes,
 * cadastrar/editar/remover respostas rápidas só era possível numa aba
 * separada dentro do Cérebro da IA (pedido do fundador: não fazia sentido
 * gerenciar num lugar e usar em outro). Um botão de engrenagem no cabeçalho
 * do dropdown alterna para o `QuickRepliesPanel` completo (mesmo
 * componente da tela antiga, reaproveitado aqui sem duplicar CRUD) dentro
 * do próprio popover; "Voltar" retorna à lista de inserção. A aba
 * "Respostas Rápidas" que existia em `ai.tsx` foi removida.
 *
 * Reskin 2026-08-27: a casca virou uma CÁPSULA fiel à referência (WhatsApp
 * Web) — `+` para anexo, ícone discreto de respostas rápidas, textarea que
 * cresce sozinha e botão de envio circular. Decisão explícita do fundador:
 * o botão Enviar é FIXO (a referência troca por microfone quando o campo
 * está vazio; aqui não há gravação de áudio, então o toggle prometeria uma
 * função inexistente). Sem botão de emoji pelo mesmo motivo — o app não tem
 * seletor. Nenhuma linha da lógica de envio/toast/anexo/respostas rápidas
 * foi tocada neste reskin.
 */
export default function MessageComposer({
  conversationId,
  sessionName,
  onSent,
}: MessageComposerProps): JSX.Element {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reskin 2026-08-27 — a casca virou uma cápsula, então a textarea não pode
   * mais ter altura fixa de 2 linhas: começa com 1 e cresce com o conteúdo
   * até o teto, quando passa a rolar internamente. Sem biblioteca — é só
   * medir `scrollHeight` a cada mudança de texto.
   */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_TEXTAREA_HEIGHT_PX = 132; // ~6 linhas a 22px

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [content]);

  // Fase 1, Bloco F1.9 — Respostas Rápidas: dropdown local (sem Radix novo,
  // mesmo racional já usado no projeto para evitar dependência/reestruturação
  // sem necessidade — ex. `<select>` nativo em `UserManagementPanel`).
  const isFreePlan = useIsFreePlan();
  const { quickReplies, refresh: refreshQuickReplies } = useQuickReplies(sessionName);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [managingQuickReplies, setManagingQuickReplies] = useState(false);
  const quickRepliesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showQuickReplies) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (quickRepliesRef.current && !quickRepliesRef.current.contains(event.target as Node)) {
        setShowQuickReplies(false);
        setManagingQuickReplies(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showQuickReplies]);

  const insertQuickReply = useCallback((text: string) => {
    setContent((current) => (current.trim().length > 0 ? `${current} ${text}` : text));
    setShowQuickReplies(false);
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite selecionar o MESMO arquivo de novo depois de removido
    if (!file) return;
    if (file.size > MAX_CLIENT_FILE_BYTES) {
      toast({
        variant: 'destructive',
        title: 'Arquivo grande demais',
        description: 'O limite é de 16MB por envio.',
      });
      return;
    }
    setSelectedFile(file);
  }, []);

  const clearSelectedFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const submit = useCallback(async (): Promise<void> => {
    if (sending) return;
    const trimmed = content.trim();

    if (selectedFile) {
      setSending(true);
      try {
        await sendConversationMedia(conversationId, selectedFile, {
          contentType: mediaContentTypeFor(selectedFile),
          caption: trimmed || undefined,
        });
        setContent('');
        setSelectedFile(null);
        onSent();
        // Fase 1, Bloco F1.7 — feedback inequívoco de sucesso: o envio de
        // mídia é síncrono (200 só após confirmação real do WhatsApp), então
        // este toast reflete entrega confirmada, não só "enfileirado".
        toast({ title: 'Arquivo enviado' });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível enviar o arquivo',
          description: errorMessageFor(error),
        });
      } finally {
        setSending(false);
      }
      return;
    }

    if (!trimmed) return;
    setSending(true);
    try {
      await sendConversationMessage(conversationId, trimmed);
      setContent('');
      onSent();
      // Fase 1, Bloco F1.7 — o envio de texto é assíncrono (202, despachado
      // pela fila outbound): o toast confirma que o PEDIDO foi aceito, não a
      // entrega no WhatsApp (essa confirmação chega depois, via a bolha
      // aparecendo na timeline em tempo real) — texto deliberadamente
      // diferente do de mídia acima.
      toast({ title: 'Mensagem enviada' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível enviar',
        description: errorMessageFor(error),
      });
    } finally {
      setSending(false);
    }
  }, [content, sending, selectedFile, conversationId, onSent]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  const canSubmit = !sending && (content.trim().length > 0 || selectedFile !== null);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {selectedFile && (
        <div className="flex items-center gap-2 self-start rounded-full border border-input bg-muted/50 px-3 py-1.5 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 truncate text-foreground">{selectedFile.name}</span>
          <button
            type="button"
            onClick={clearSelectedFile}
            aria-label="Remover anexo"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {/*
        Reskin 2026-08-27 — casca em CÁPSULA, fiel à referência: raio alto,
        fundo claro, borda/sombra quase imperceptíveis, altura compacta e
        controles pequenos que parecem parte da própria caixa. Os botões usam
        `self-end` para continuarem ancorados embaixo enquanto a textarea
        cresce.
      */}
      <div className="flex items-end gap-1 rounded-[22px] border border-input bg-card px-2 py-1 shadow-sm focus-within:border-primary/40 focus-within:ring-[3px] focus-within:ring-primary/10">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Anexar arquivo"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 self-end rounded-full text-muted-foreground"
          disabled={sending}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Anexar arquivo"
        >
          <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
        </Button>
        <div ref={quickRepliesRef} className="relative shrink-0 self-end">
          {/* T4 (Trava de plano): respostas rápidas é recurso do Plano Pro — some no Grátis. */}
          {!isFreePlan && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground"
              disabled={sending}
              onClick={() =>
                setShowQuickReplies((current) => {
                  if (current) setManagingQuickReplies(false);
                  return !current;
                })
              }
              aria-label="Respostas rápidas"
            >
              <MessageSquareText className="h-[17px] w-[17px]" aria-hidden="true" />
            </Button>
          )}
          {!isFreePlan &&
            showQuickReplies &&
            (managingQuickReplies ? (
              <div className="fx-scroll absolute bottom-full left-0 mb-2 max-h-[420px] w-[460px] overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-menu">
                <div className="mb-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      // Reflete criações/edições/remoções feitas dentro do
                      // `QuickRepliesPanel` (que gerencia seu PRÓPRIO
                      // `useQuickReplies`, independente deste) na lista de
                      // inserção — sem isso, uma resposta recém-cadastrada
                      // só apareceria depois de reabrir o dropdown do zero.
                      setManagingQuickReplies(false);
                      refreshQuickReplies();
                    }}
                    aria-label="Voltar para a lista de respostas rápidas"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="text-[13px] font-medium text-foreground">
                    Gerenciar respostas rápidas
                  </span>
                </div>
                <QuickRepliesPanel sessionName={sessionName} />
              </div>
            ) : (
              <div className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-menu">
                <div className="fx-scroll max-h-56 overflow-y-auto p-1.5">
                  {quickReplies.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      Nenhuma resposta rápida cadastrada.
                    </p>
                  ) : (
                    quickReplies.map((quickReply) => (
                      <button
                        key={quickReply.id}
                        type="button"
                        onClick={() => insertQuickReply(quickReply.content)}
                        className="block w-full truncate rounded-lg p-2 text-left text-[13px] text-foreground hover:bg-muted"
                        title={quickReply.content}
                      >
                        {quickReply.content}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setManagingQuickReplies(true)}
                  className="flex w-full items-center gap-1.5 border-t border-border/70 p-2 text-left text-[12.5px] font-medium text-primary hover:bg-muted"
                >
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Cadastrar / gerenciar respostas rápidas
                </button>
              </div>
            ))}
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedFile ? 'Legenda (opcional)…' : 'Escreva sua resposta…'}
          title="Enter envia · Shift+Enter quebra linha"
          rows={1}
          maxLength={MAX_LENGTH}
          className="fx-scroll max-h-[132px] min-h-[24px] flex-1 resize-none self-center border-0 bg-transparent px-1 py-1 text-[14.2px] leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon"
          className="h-8 w-8 shrink-0 self-end rounded-full shadow-cta"
          disabled={!canSubmit}
          aria-label={sending ? 'Enviando…' : 'Enviar'}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
