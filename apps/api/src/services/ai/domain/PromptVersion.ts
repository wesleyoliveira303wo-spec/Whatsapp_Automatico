import { PromptVersionNotFoundError } from './errors/PromptVersionNotFoundError';
import { ESCALATION_MARKER } from './escalationSignal';

/**
 * Uma versão de prompt de sistema, versionada em código — Milestone 3,
 * Bloco 3a (DECISÃO A do §2.6, "Registro em código", confirmada em
 * `MILESTONE_003_AI_AUTORESPONDER.md`: zero infraestrutura nova; trocar de
 * prompt passa por PR/code review como qualquer mudança de comportamento).
 */
export interface PromptVersion {
  id: string;
  systemPrompt: string;
  createdAt: string;
}

/**
 * Registro estático das versões de prompt existentes, indexado por `id`.
 * `PromptBuilder` (Application) recebe a `PromptVersion` já resolvida — não
 * é este arquivo que decide QUAL versão está ativa (isso vem de fora, hoje
 * via a variável de ambiente `AI_PROMPT_VERSION`, resolvida no composition
 * root — Bloco 5, ainda não construído).
 *
 * O texto de `systemPrompt` de `v1` é um placeholder de conteúdo de
 * produto/negócio (tom, regras de escalonamento, limites do que a IA pode
 * prometer) — não é uma decisão arquitetural; fica registrado aqui como
 * lacuna a preencher com o time de produto antes de qualquer uso em
 * produção real (ver CLAUDE.md §12, "identifique lacunas de conhecimento").
 */
export const PROMPT_VERSIONS: Record<string, PromptVersion> = {
  v1: {
    id: 'v1',
    systemPrompt:
      'Você é um assistente de atendimento via WhatsApp de uma pequena ou média empresa. ' +
      'Responda de forma clara, cordial e objetiva, em português do Brasil. ' +
      'Use apenas as informações fornecidas no histórico da conversa; nunca invente preços, prazos ' +
      'ou promessas que não tenham sido informados. Se não souber responder algo com segurança, ' +
      'ou se o cliente pedir para falar com uma pessoa, diga que vai encaminhar a conversa para um ' +
      'atendente humano, sem tentar resolver por conta própria. ' +
      // Feature N2 (auto-escalonamento): quando (e só quando) você decidir
      // encaminhar para um atendente humano, escreva a mensagem normalmente para
      // o cliente e, ao final, numa linha separada, inclua exatamente o marcador
      // abaixo. O cliente NUNCA vê esse marcador — o sistema o remove e coloca a
      // conversa na fila de atendimento humano.
      `Sempre que for encaminhar para um atendente humano, inclua ao final, numa linha separada, exatamente: ${ESCALATION_MARKER}`,
    createdAt: '2026-07-10',
  },
};

/**
 * Resolve uma `PromptVersion` pelo `id`, lançando `PromptVersionNotFoundError`
 * se o `id` não existir no registro — mesmo espírito defensivo de
 * `AiProviderFactoryImpl.create()` (Infrastructure): um `id` inválido só
 * pode vir de configuração incorreta (`AI_PROMPT_VERSION` apontando para uma
 * versão que não existe mais em código), nunca de um caminho normal de
 * execução. Erro de Domain dedicado (não `Error` genérico) desde a auditoria
 * do Bloco 3a (achado F2) — permite mapeamento por `instanceof` na
 * Presentation, não por string de mensagem.
 */
export function getPromptVersion(id: string): PromptVersion {
  const promptVersion = PROMPT_VERSIONS[id];
  if (!promptVersion) {
    throw new PromptVersionNotFoundError(id);
  }
  return promptVersion;
}
