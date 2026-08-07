import { useEffect, useState } from 'react';
import { fetchContactAvatar } from '../lib/clientApi';

/**
 * Cache de módulo — em memória, sobrevive entre montagens/desmontagens de
 * componentes na mesma aba (Milestone 6, Bloco M6H-2b, achado do teste real
 * de 2026-07-25): a inbox pede a MESMA foto duas vezes ao abrir uma conversa
 * (uma vez pela linha da lista, outra pelo cabeçalho do painel de detalhe) —
 * sem dedup, isso dobra (ou mais, se houver várias linhas visíveis) a
 * quantidade de queries simultâneas ao socket do Baileys, que já provou ser
 * sensível a isso (ver `BaileysProvider.getProfilePictureUrl`, timeout
 * próprio adicionado no mesmo incidente). `inFlight` deduplica chamadas
 * concorrentes para o mesmo contato; `resolved` evita reconsultar de novo ao
 * remontar (ex.: sair e voltar para a conversa) dentro da mesma sessão do
 * navegador — aceitável porque uma foto de perfil ENCONTRADA muda raramente.
 *
 * CORREÇÃO 2026-07-30 (bug real reportado pelo fundador: foto nunca aparece,
 * mesmo em contatos com foto pública confirmada, e nem F5 resolve):
 * `resolved` gravava `avatarUrl: undefined` PERMANENTEMENTE mesmo quando a
 * causa foi só o timeout de 6s de `BaileysProvider.getProfilePictureUrl`
 * (a API sempre responde 200, então do ponto de vista do fetch um timeout
 * transitório e uma ausência real de foto eram idênticos) — uma falha
 * passageira (sessão reconectando, socket sob carga ao abrir a inbox
 * inteira de uma vez) travava aquele contato em "sem foto" pelo resto da
 * aba, sem nenhuma forma de retry a não ser um reload completo da página
 * (que recria o módulo JS e zera o Map). Corrigido com um TTL curto
 * (`NO_AVATAR_RETRY_MS`) só para o caso "sem foto" — uma URL de verdade
 * continua cacheada para sempre (não muda), mas `undefined` expira e uma
 * nova tentativa acontece depois de um tempo, sem precisar de F5.
 */
const inFlight = new Map<string, Promise<string | undefined>>();
const resolved = new Map<string, string | undefined>();
const resolvedAt = new Map<string, number>();

/** Quanto tempo um resultado "sem foto" fica cacheado antes de tentar de novo — bem menor que "para sempre" (o comportamento antigo), mas ainda alto o suficiente para não martelar o socket a cada remontagem de componente. */
const NO_AVATAR_RETRY_MS = 60_000;

function cacheKey(sessionName: string, contactJid: string): string {
  return `${sessionName}::${contactJid}`;
}

function hasFreshCacheEntry(key: string): boolean {
  if (!resolved.has(key)) return false;
  // Uma URL de verdade nunca expira (fotos de perfil mudam raramente); só
  // um resultado "sem foto" (`undefined`) tem TTL, porque pode ter sido um
  // timeout transitório em vez de uma ausência real.
  if (resolved.get(key) !== undefined) return true;
  const at = resolvedAt.get(key) ?? 0;
  return Date.now() - at < NO_AVATAR_RETRY_MS;
}

function loadAvatar(sessionName: string, contactJid: string): Promise<string | undefined> {
  const key = cacheKey(sessionName, contactJid);
  if (hasFreshCacheEntry(key)) {
    return Promise.resolve(resolved.get(key));
  }
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }
  const request = fetchContactAvatar(sessionName, contactJid)
    .then((result) => {
      resolved.set(key, result.avatarUrl);
      resolvedAt.set(key, Date.now());
      return result.avatarUrl;
    })
    .catch(() => {
      // Falha silenciosa (ver docstring de `useContactAvatar`) — não
      // guarda em `resolved` (permite tentar de novo numa próxima
      // montagem, ao contrário de um sucesso ou de "sem foto").
      return undefined;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

/**
 * Foto de perfil de um contato (Milestone 6, Bloco M6H-2b) — busca UMA vez
 * por (`sessionName`, `contactJid`) ao montar/trocar de contato, sem
 * polling: diferente de status/mensagens (que mudam a cada segundo), uma
 * foto de perfil muda raramente, e cada chamada é uma ida ao socket Baileys
 * ao vivo (`WhatsAppProvider.getProfilePictureUrl`) — reconsultar a cada
 * poll de 4-5s seria desperdício sem benefício percebido. Deduplicada e
 * cacheada em memória via `loadAvatar` (ver comentário acima).
 *
 * Falha silenciosamente: qualquer erro (rede, sessão sem conexão, contato
 * sem foto) vira `undefined` — nunca um estado de erro visível, porque a
 * ausência de avatar é o caso comum, não uma falha (ver `ContactAvatar.tsx`
 * para o fallback visual).
 */
/**
 * Limpa os `Map`s de cache de módulo — EXCLUSIVAMENTE para uso em testes
 * (2026-07-31). Sem isso, testes que reutilizam o mesmo `sessionName`/
 * `contactJid` entre si "vazam" o resultado de um `it()` para o próximo,
 * porque o cache é intencionalmente de módulo (sobrevive a remontagens
 * reais — ver docstring acima), não de instância do hook. Nunca chamado em
 * código de produção.
 */
export function __resetContactAvatarCacheForTests(): void {
  inFlight.clear();
  resolved.clear();
  resolvedAt.clear();
}

export function useContactAvatar(
  sessionName: string | undefined,
  contactJid: string | undefined,
): string | undefined {
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    setAvatarUrl(undefined);
    if (!sessionName || !contactJid) return;
    let cancelled = false;

    loadAvatar(sessionName, contactJid).then((url) => {
      if (!cancelled) setAvatarUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [sessionName, contactJid]);

  return avatarUrl;
}
