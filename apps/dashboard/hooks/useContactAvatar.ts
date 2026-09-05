import { useEffect, useState } from 'react';
import { fetchContactAvatars } from '../lib/clientApi';

/**
 * Bloco B2 (issue #13) — REESCRITO. Antes, cada avatar montado fazia a
 * própria requisição, e cada requisição virava uma consulta AO VIVO no
 * socket Baileys: com uma lista de dezenas de linhas isso bombardeava o
 * mesmo socket que envia as mensagens reais (ADR #78; e foi por isso que as
 * listas passaram a não buscar foto nenhuma, correção de 2026-08-18).
 *
 * Agora são duas mudanças, e é a combinação delas que resolve:
 *
 * 1. O servidor responde de um CACHE em Postgres e atualiza o que venceu
 *    fora do caminho da requisição, com teto de concorrência — nenhuma
 *    consulta ao WhatsApp acontece enquanto a tela espera.
 * 2. Aqui, os pedidos que aparecem no mesmo instante (todas as linhas de uma
 *    lista montam juntas) são AGRUPADOS numa requisição só, em vez de uma
 *    por linha.
 *
 * O agrupamento é feito por um pequeno atraso (`BATCH_WINDOW_MS`): cada
 * componente registra o JID que precisa, e quando a janela fecha sai um
 * único POST com todos. É o mesmo princípio de um DataLoader, sem
 * dependência nova.
 */

/**
 * Janela de agrupamento. Curta o bastante para ninguém perceber, longa o
 * bastante para uma lista inteira montar dentro dela.
 */
const BATCH_WINDOW_MS = 30;

/**
 * Teto por requisição — espelha o limite validado na API (300). Uma tela
 * maior que isso é quebrada em requisições sucessivas em vez de tomar 400.
 */
const MAX_JIDS_PER_REQUEST = 300;

/**
 * Uma foto ENCONTRADA não é reconsultada nesta aba (mudam raramente); um
 * "sem foto" tem validade curta, para a tela perceber quando o servidor
 * preencheu o cache (o que acontece quando aquele contato manda mensagem).
 *
 * Alinhado ao `RETRY_TICK_MS`: um valor maior que o do ticker faria o ticker
 * bater e não fazer nada, que é como este TTL passou despercebido até a
 * medição de 2026-09-05.
 */
const NO_AVATAR_RETRY_MS = 60_000;

type Listener = (avatarUrl: string | undefined) => void;

const resolved = new Map<string, string | undefined>();
const resolvedAt = new Map<string, number>();
const pending = new Map<string, Set<string>>();
const listeners = new Map<string, Set<Listener>>();
/** Quem está na tela agora, para o ticker saber o que repedir. */
const subscribed = new Map<string, { sessionName: string; contactJid: string }>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setInterval> | undefined;

/**
 * De quanto em quanto tempo a tela relê o cache do servidor à procura de
 * fotos que chegaram desde a última leitura.
 *
 * MUDANÇA DE GATILHO (2026-09-05, decisão do fundador): esta releitura NÃO
 * dispara mais nenhuma consulta ao WhatsApp. O endpoint em lote virou
 * leitura pura do cache; quem manda buscar a foto é a chegada de uma
 * MENSAGEM daquele contato, no servidor. Aqui só se relê o que já foi
 * preenchido.
 *
 * Por isso o intervalo pôde afrouxar de 20s para 60s: antes ele era o
 * motor da busca (e precisava insistir), agora é só um "veio foto nova?"
 * contra o Postgres. Um único ticker para a tela inteira, e cada rodada vira
 * UMA requisição, pelo agrupamento que já existe.
 */
const RETRY_TICK_MS = 60_000;

function startRetryTicker(): void {
  if (retryTimer !== undefined) return;
  retryTimer = setInterval(() => {
    if (subscribed.size === 0) {
      clearInterval(retryTimer);
      retryTimer = undefined;
      return;
    }
    for (const { sessionName, contactJid } of subscribed.values()) {
      // `requestAvatar` ignora quem já tem resultado fresco — na prática só
      // os que ainda não têm foto entram na próxima leva. Como o endpoint é
      // leitura de cache, esta leva não toca o WhatsApp.
      requestAvatar(sessionName, contactJid);
    }
  }, RETRY_TICK_MS);
}

function cacheKey(sessionName: string, contactJid: string): string {
  return `${sessionName}::${contactJid}`;
}

function hasFreshEntry(key: string): boolean {
  if (!resolved.has(key)) return false;
  if (resolved.get(key) !== undefined) return true;
  return Date.now() - (resolvedAt.get(key) ?? 0) < NO_AVATAR_RETRY_MS;
}

function publish(key: string, avatarUrl: string | undefined): void {
  resolved.set(key, avatarUrl);
  resolvedAt.set(key, Date.now());
  const subscribers = listeners.get(key);
  if (!subscribers) return;
  for (const listener of subscribers) listener(avatarUrl);
}

function scheduleFlush(): void {
  if (flushTimer !== undefined) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushPending();
  }, BATCH_WINDOW_MS);
}

async function flushPending(): Promise<void> {
  const batches = [...pending.entries()];
  pending.clear();

  for (const [sessionName, jids] of batches) {
    const all = [...jids];
    for (let i = 0; i < all.length; i += MAX_JIDS_PER_REQUEST) {
      const chunk = all.slice(i, i + MAX_JIDS_PER_REQUEST);
      try {
        const { avatars } = await fetchContactAvatars(sessionName, chunk);
        const byJid = new Map(avatars.map((entry) => [entry.contactJid, entry.avatarUrl]));
        // Publica TODO o pedaço, inclusive os que não vieram na resposta:
        // ausência também é informação ("sem foto"), e sem publicar o
        // componente ficaria esperando para sempre.
        for (const contactJid of chunk) {
          publish(cacheKey(sessionName, contactJid), byJid.get(contactJid));
        }
      } catch {
        // Falha silenciosa (a ausência de avatar é o caso comum, não um
        // erro visível — ver `ContactAvatar.tsx`). Deliberadamente NÃO grava
        // em `resolved`: assim uma falha passageira é retentada na próxima
        // montagem, em vez de travar o contato em "sem foto".
        for (const contactJid of chunk) {
          const subscribers = listeners.get(cacheKey(sessionName, contactJid));
          if (subscribers) for (const listener of subscribers) listener(undefined);
        }
      }
    }
  }
}

function requestAvatar(sessionName: string, contactJid: string): void {
  const key = cacheKey(sessionName, contactJid);
  if (hasFreshEntry(key)) return;
  const forSession = pending.get(sessionName) ?? new Set<string>();
  forSession.add(contactJid);
  pending.set(sessionName, forSession);
  scheduleFlush();
}

/**
 * Limpa o estado de módulo — EXCLUSIVAMENTE para testes. O cache é de
 * módulo de propósito (sobrevive a remontagens reais), então sem isto o
 * resultado de um `it()` vazaria para o próximo.
 */
export function __resetContactAvatarCacheForTests(): void {
  resolved.clear();
  resolvedAt.clear();
  pending.clear();
  listeners.clear();
  subscribed.clear();
  if (retryTimer !== undefined) {
    clearInterval(retryTimer);
    retryTimer = undefined;
  }
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
}

/**
 * Foto de perfil de um contato. A assinatura é a mesma de sempre — quem
 * chama não sabe (nem precisa saber) que os pedidos viram um lote só.
 *
 * Falha silenciosamente: qualquer erro vira `undefined`, nunca um estado de
 * erro visível, porque não ter avatar é o caso comum.
 */
export function useContactAvatar(
  sessionName: string | undefined,
  contactJid: string | undefined,
): string | undefined {
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() =>
    sessionName && contactJid ? resolved.get(cacheKey(sessionName, contactJid)) : undefined,
  );

  useEffect(() => {
    if (!sessionName || !contactJid) {
      setAvatarUrl(undefined);
      return;
    }
    const key = cacheKey(sessionName, contactJid);
    setAvatarUrl(resolved.get(key));

    let cancelled = false;
    const listener: Listener = (url) => {
      if (!cancelled) setAvatarUrl(url);
    };
    const subscribers = listeners.get(key) ?? new Set<Listener>();
    subscribers.add(listener);
    listeners.set(key, subscribers);
    subscribed.set(key, { sessionName, contactJid });

    requestAvatar(sessionName, contactJid);
    startRetryTicker();

    return () => {
      cancelled = true;
      subscribers.delete(listener);
      if (subscribers.size === 0) {
        listeners.delete(key);
        subscribed.delete(key);
        // Encerra o ticker na hora em que a última tela sai — esperar o
        // próximo tique deixaria um timer vivo à toa (e um handle aberto nos
        // testes).
        if (subscribed.size === 0 && retryTimer !== undefined) {
          clearInterval(retryTimer);
          retryTimer = undefined;
        }
      }
    };
  }, [sessionName, contactJid]);

  return avatarUrl;
}
