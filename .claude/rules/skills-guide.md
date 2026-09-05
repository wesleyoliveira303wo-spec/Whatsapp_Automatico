# Guia de Skills, MCPs e Plugins — quando usar cada um neste projeto

> Criado em 2026-08-22. Ferramentas instaladas no escopo do usuário (valem em
> qualquer sessão desta máquina), documentadas em detalhe no Obsidian Vault —
> ver `Claude Code - Índice de Projetos e Skills.md` e as notas individuais
> linkadas de lá.

**Regra permanente: sugerir proativamente, nunca esperar ser perguntado.**
Sempre que uma situação abaixo aparecer numa tarefa, mencione a ferramenta
relevante e por que ela se aplica — o fundador pediu explicitamente para não
precisar adivinhar quando invocar cada uma.

## `web-design-guidelines` (skill)

**Quando sugerir:** qualquer mudança em `apps/dashboard/components` ou
`apps/dashboard/pages` que toque HTML/JSX visível — componente novo,
refatoração de tela, correção de bug visual. Também quando o fundador disser
algo como "ficou feio", "não tá legal", "dá uma olhada nisso aqui".

**Achados já conhecidos a não repetir:** falta de virtualização em listas
grandes (Conversas, Pipeline).

## `shadcn` (MCP)

**Quando sugerir:** ao adicionar QUALQUER componente shadcn/ui novo (ex.
`Combobox`, `DataTable`, `Command`) — puxar o código-fonte oficial em vez de
reconstruir de memória. Também quando parecer que um componente existente
(`Button`, `Dialog`, `Select`) está desatualizado frente à versão oficial.

## `21st` (MCP)

**Quando sugerir:** ao prototipar uma tela nova do zero, ou quando o
fundador pedir "várias opções" de layout para uma tela antes de decidir.
NÃO usar para telas que já têm reskin feito no Design System — ali o padrão
já está definido, gerar algo novo desalinharia.

## `chrome-devtools` (MCP)

**Quando sugerir:** depois de qualquer mudança visual, para validar de
verdade em vez de pedir F5+print ao fundador — MAS só quando o ambiente
Docker já estiver de pé (`docker compose up -d`) e alguém puder logar
(ferramentas de IA nunca digitam senha — se autenticação for necessária,
pedir para o fundador logar na aba já aberta). Também para investigar
qualquer bug relatado "na tela" (console, rede, performance).

## `superpowers` (plugin — 14 skills, dispara sozinho)

Já ativo automaticamente em toda tarefa (hook `SessionStart`). Duas skills
com relevância direta comprovada neste projeto:

- `systematic-debugging` / `verification-before-completion` — mesmo
  princípio já aprendido por experiência própria (ADR #88 do `CLAUDE.md`:
  "não acumular hipóteses sem medir"). Usar deliberadamente em qualquer bug
  que sobreviva à primeira tentativa de correção.
- As demais (brainstorming, TDD estrito, git worktrees, subagent-driven
  development) tendem a ser MAIS PESADAS do que o ritmo real do projeto até
  aqui (histórico mostra muito hotfix/diagnóstico rápido). Usar com
  julgamento: para uma feature nova e grande, o fluxo completo faz sentido;
  para uma correção pontual, seguir o processo mais leve já estabelecido no
  `CLAUDE.md` (§13) em vez de forçar o fluxo completo do Superpowers.

## Achados de auditoria pendentes (2026-08-22)

- [x] ~~Alternativa de teclado para mover cards no Pipeline~~ — JÁ EXISTE
      desde a própria auditoria de 2026-08-22: cada `PipelineCard` tem um
      `<select>` nativo de estágio, operável por teclado e leitor de tela,
      compartilhando a mesma gravação do arrasto. O item ficou marcado como
      pendente por engano (verificado em 2026-09-05).
- [ ] Virtualizar lista de Conversas e colunas do Pipeline (limite de 50+ já
      superado em uso real) — issue #15.
