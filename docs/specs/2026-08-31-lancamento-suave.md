# Spec — Lançamento suave do Francis

> Gerada por `/to-spec` a partir da sessão de `/grill-with-docs` de 2026-08-31.
> Vocabulário: ver `CONTEXT.md` (Plano, Plano Grátis/Pro/Enterprise, Trava de
> plano, Billing manual, Lançamento suave). Publicar como issue no GitHub com
> o label `ready-for-agent` assim que `gh auth login` estiver feito.

## Problem Statement

O Francis está funcionalmente pronto (Fase 1 + Fase L concluídas), mas nunca
foi lançado: roda só em `localhost`, não há forma de um cliente pagar, e não
há distinção entre quem pode usar e quem só pode olhar. O fundador quer
colocar o produto no ar o quanto antes, de graça (sem orçamento para
infraestrutura), de um jeito que qualquer pessoa possa se cadastrar e
conhecer o produto, mas que o uso de verdade (a IA respondendo pelos
clientes) só aconteça para quem assina um plano pago.

## Solution

Um **Lançamento suave**: a landing page e o cadastro (`/register`) ficam
públicos e abertos. Qualquer pessoa cria uma conta, que nasce no **Plano
Grátis** — pode conectar um WhatsApp e ver as mensagens chegando na Dashboard
em tempo real, mas nada além disso (é uma demonstração). O uso real — a IA
respondendo automaticamente, o operador respondendo pela Dashboard, e
disparar campanhas — fica atrás da **Trava de plano**: só funciona se o
`Tenant.plan` for `pro` ou `enterprise`.

Não há cobrança automática. Um cliente que quer o Pro cria a conta Grátis,
chama o fundador no WhatsApp (5521982925941), o fundador marca o plano no
banco via script e o pagamento é combinado por Pix (**Billing manual**).

O produto sobe numa VM gratuita da Oracle Cloud (Always Free), acessível por
`https://<ip>.sslip.io`, monitorada por um serviço gratuito de uptime. Antes
de anunciar, uma bateria de estabilização (suíte de testes verde, migrations
aplicadas) e uma validação real ponta a ponta no ambiente publicado.

## User Stories

Visitante / aquisição:

1. Como visitante, quero abrir a página inicial do Francis e entender em
   poucos segundos o que o produto faz, para decidir se vale criar uma conta.
2. Como visitante, quero ver os planos e preços (Grátis, Pro R$ 99/mês,
   Enterprise R$ 349/mês) claramente, para saber quanto custa usar de verdade.
3. Como visitante, quero clicar em "Criar conta grátis" e chegar direto no
   cadastro, sem fricção.
4. Como visitante interessado no Pro ou Enterprise, quero um caminho óbvio
   para falar com alguém e ativar o plano, para conseguir pagar e usar.
5. Como visitante, quero acessar os Termos de Uso e a Política de Privacidade
   a partir do rodapé, para saber a que estou concordando.

Cadastro e Plano Grátis:

6. Como novo usuário, quero me cadastrar com e-mail e senha e já entrar na
   plataforma, para começar a explorar imediatamente.
7. Como usuário do Plano Grátis, quero conectar meu número de WhatsApp por QR
   Code, para ver o Francis funcionando com o meu número.
8. Como usuário do Plano Grátis, quero ver as mensagens que meus clientes
   mandam aparecerem na Dashboard em tempo real, para sentir como seria usar
   o produto.
9. Como usuário do Plano Grátis, quero que fique claro em cada tela de
   recurso pago que aquilo está disponível no Pro, para eu saber o que ganho
   ao assinar.
10. Como usuário do Plano Grátis, quero que a IA NÃO responda meus clientes
    automaticamente, porque esse é o recurso que eu pago para ter.
11. Como usuário do Plano Grátis, quero entender por que não consigo
    responder uma conversa pela Dashboard, com uma mensagem clara de que isso
    é um recurso pago.
12. Como usuário do Plano Grátis, quero poder navegar pelo Cérebro da IA,
    Pipeline, Contatos, Campanhas e Analytics e ver como são, mesmo sem poder
    usá-los.

Cliente pagante (Pro / Enterprise):

13. Como dono de PME, quero pedir o upgrade para o Pro chamando o fundador no
    WhatsApp, para ativar o uso real.
14. Como cliente recém-ativado no Pro, quero que a IA passe a responder meus
    clientes automaticamente sem eu reconfigurar nada, porque já configurei
    tudo no período Grátis.
15. Como cliente Pro, quero conectar 1 número de WhatsApp e usar todos os
    recursos (IA, handoff, Pipeline, Campanhas, Contatos, Tags, Analytics,
    respostas rápidas, resumo de conversa).
16. Como cliente Enterprise, quero conectar até 5 números de WhatsApp na
    mesma conta.
17. Como operador de um cliente pago, quero assumir uma conversa e responder
    pela Dashboard (texto e mídia), para atender quando a IA escala.
18. Como cliente pago, quero disparar uma campanha para minha base de
    contatos, para reengajar leads.
19. Como cliente rebaixado para Grátis (parou de pagar), quero que a IA pare
    de responder e eu volte ao modo só-leitura, sem perder meus dados.

Fundador / operação:

20. Como fundador, quero um comando de terminal para marcar um tenant como
    `pro` ou `enterprise`, para ativar um cliente que pagou.
21. Como fundador, quero um comando de terminal para rebaixar um tenant de
    volta para `free`, para desativar um cliente que parou de pagar.
22. Como fundador, quero um comando de terminal que apague todos os dados de
    um tenant a pedido, para cumprir a LGPD sem mexer no banco à mão.
23. Como fundador, quero rodar o produto inteiro numa VM gratuita com um
    `docker compose up`, para não gastar com infraestrutura.
24. Como fundador, quero acessar o produto por um endereço HTTPS estável sem
    comprar domínio, para poder mostrar a clientes.
25. Como fundador, quero receber um e-mail se o produto sair do ar, para agir
    antes do cliente reclamar.
26. Como fundador, quero rodar a suíte de testes completa e ela passar 100%,
    para ter confiança de que nada quebrou antes de subir.
27. Como fundador, quero fazer uma validação real ponta a ponta no ambiente
    publicado (conectar um WhatsApp de verdade, IA responder, assumir, enviar
    mídia, campanha, Pipeline, Analytics), para confirmar que funciona fora
    do meu `localhost`.
28. Como fundador, quero confirmar o caminho do Plano Grátis no ambiente
    publicado (cadastro, conectar, ver mensagem chegar, IA não responder,
    avisos de upgrade), para não descobrir um furo com um cliente real.
29. Como fundador, quero que o código esteja no GitHub, para não perder meses
    de trabalho se o HD falhar.

Cliente final (indireto):

30. Como cliente final que manda mensagem para uma empresa no Plano Grátis,
    quero não receber uma resposta automática confusa, porque a empresa ainda
    não ativou a IA.

## Implementation Decisions

Schema:

- Novo campo `Tenant.plan` — enum com valores `free`, `pro`, `enterprise`,
  default `free`. Migration aditiva. Todo tenant existente e todo tenant novo
  (via `/register`, ADR #105) nasce `free`.
- Sem campos de billing (vencimento, valor, gateway) — Billing manual, fora
  de escopo.

Domain — a Trava de plano:

- Um predicado puro, único, `planPermiteUso(plan)`: `false` para `free`,
  `true` para `pro` e `enterprise`. Única fonte de verdade da trava. Vive no
  bounded context de conversas ou num lugar compartilhado se o de campanhas
  também precisar importá-lo — localização a cargo da implementação, desde
  que seja UM predicado.
- Aplicação 1 — IA automática: `shouldAutoRespond` ganha um parâmetro
  booleano derivado do plano, na mesma forma do parâmetro `sessionAiEnabled`
  que já existe ali (padrão do Botão POWER, ADR #99). Um tenant `free` nunca
  enfileira job de `ai-reply`; um job legado é re-checado e descartado no
  processamento (mesma rede de segurança do toggle).
- Aplicação 2 — resposta do operador: `ConversationsService.sendAgentMessage`
  e `sendAgentMediaMessage` recusam com um erro de Domain novo quando o
  tenant é `free`, traduzido numa resposta HTTP 403, espelhando
  `ConversationNotHumanError` → 409. Plano Grátis é só-leitura na conversa.
- Aplicação 3 — campanhas: `CampaignService.startCampaign` recusa quando o
  tenant é `free`, espelhando o erro que já lança quando o motor de envio não
  está configurado. Criar/rascunhar campanha continua liberado (não envia
  nada); iniciar o disparo é o que a trava bloqueia.
- Limite de sessões por plano (`pro` = 1, `enterprise` = 5) NÃO é imposto em
  código nesta fase — o fundador controla manualmente ao ativar o cliente.

Exposição do plano:

- O `plan` do tenant passa a ser devolvido pelo endpoint de
  tenant/identidade que o Dashboard já consome (o mesmo que devolve nome do
  tenant / usuário logado). Nenhum endpoint novo. O BFF repassa; o Dashboard
  lê para decidir o que mostrar.

Dashboard:

- Componente reutilizável de "recurso disponível no Pro" — substitui o
  conteúdo das telas de recurso pago (Cérebro da IA, Pipeline, Campanhas,
  Contatos, Tags, Analytics, respostas rápidas, resumo de conversa) quando
  `plan === 'free'`, com um CTA para o contato comercial.
- "Conectar WhatsApp" e a tela de Conversas (inbox, só-leitura) permanecem
  acessíveis no Plano Grátis.
- Na tela de conversa, para tenant `free`, o campo de resposta do operador é
  substituído por um aviso de que responder é recurso pago.
- Landing: a seção de Planos é reescrita — Grátis (R$ 0, "conecte um WhatsApp
  e veja as mensagens chegando; a IA não responde"), Pro (R$ 99/mês, 1
  número, uso completo), Enterprise (R$ 349/mês, até 5 números, uso
  completo). Os CTAs de Pro e Enterprise criam a conta no Plano Grátis e
  levam a uma mensagem instruindo a chamar o WhatsApp comercial
  5521982925941 para ativar.

Páginas legais:

- Duas páginas estáticas novas: `/termos` (Termos de Uso) e `/privacidade`
  (Política de Privacidade), enxutas, cobrindo o essencial para um produto
  que guarda conversas de clientes de PMEs brasileiras (o que é coletado,
  para quê, retenção, direito de exclusão a pedido, contato). Os links "(em
  breve)" do rodapé da landing passam a apontar para elas.

Scripts de operação (CLI, sem UI):

- `setTenantPlan` — recebe um identificador de tenant e um plano
  (`free`/`pro`/`enterprise`) e atualiza o campo. Modo simulação por padrão,
  flag para aplicar (mesmo contrato dos scripts existentes, ex.:
  `backfillContacts`).
- `deleteTenant` — apaga em cascata todos os dados de um tenant (conversas,
  mensagens, sessões, contatos, campanhas, perfis de IA, usuários, auditoria,
  etc.). Modo simulação por padrão, flag para aplicar. Atende ao direito de
  exclusão da LGPD.

Estabilização:

- Corrigir os dois testes que já falhavam antes desta spec (ADRs #105/#106):
  um em `AiProfilePanel` (Dashboard, jsdom) e um em `ConversationAiService`
  (API). Falhas conhecidas em arquivos não relacionados — corrigir para a
  suíte voltar a 100%.
- Aplicar todas as migrations pendentes (várias features da Fase 6/L estão
  "migration pendente na máquina do usuário" em `PROJECT_STATUS.md` §30.x).
- `tsc`, `lint` e `build` limpos em `apps/api` e `apps/dashboard`; suíte
  completa do monorepo verde.

## Testing Decisions

Um bom teste aqui verifica o **comportamento observável** da Trava de plano —
"tenant `free` não tem resposta automática de IA", "tenant `free` recebe erro
ao responder pela Dashboard", "tenant `free` recebe erro ao iniciar
campanha", "tenant `pro`/`enterprise` faz tudo normalmente" — nunca a forma
interna do predicado.

- `planPermiteUso` (predicado puro) — teste unitário trivial, um caso por
  valor de enum. Prior art: `shouldAutoRespond.test.ts`,
  `shouldAiUpdateStage.test.ts`, `shouldGenerateReply.test.ts`.
- `shouldAutoRespond` com o novo parâmetro — estender o teste existente com
  "plano não permite → false" e "plano permite + resto ok → true". Prior
  art: os casos que hoje cobrem `sessionAiEnabled`.
- `ConversationsService.sendAgentMessage` / `sendAgentMediaMessage` —
  adicionar "tenant free → erro" ao lado de "conversa não é human → erro" e
  "ownership". Prior art: a suíte atual de `ConversationsService` (Fakes de
  repositório).
- `CampaignService.startCampaign` — adicionar "tenant free → erro" ao lado de
  "motor de envio ausente → erro". Prior art: a suíte atual de
  `CampaignService` (`FakeCampaignRepository`).
- Exposição do `plan` — o teste de integração/BFF existente do endpoint de
  tenant/identidade ganha uma asserção de que `plan` vem na resposta.
- Dashboard: teste jsdom do componente "disponível no Pro" (renderiza para
  `plan === 'free'`, esconde o conteúdo real) e do gate do campo de resposta
  na tela de conversa. Prior art: testes jsdom de estados de tela.
- `deleteTenant` — teste de integração contra Postgres real: apagar um tenant
  não deixa linha órfã em nenhuma tabela relacionada. Prior art:
  `contactIdentity.integration.test.ts`,
  `campaignEligibility.integration.test.ts`.
- Landing e páginas legais — teste jsdom leve: a seção de planos mostra os
  três planos e os preços certos; o rodapé linka `/termos` e `/privacidade`;
  as duas páginas renderizam. Prior art: `landingPage.test.tsx`.

## Out of Scope

- **Billing automático** — gateway, assinatura recorrente, cobrança por
  cartão, cancelamento self-service. Fase 4.
- **Console de admin / super-admin** — visão de todos os tenants, painel de
  saúde por tenant, fluxo de "pedir acesso ao tenant do cliente e ele aceitar
  da máquina dele". Ativação de plano e exclusão de dados são por script CLI
  nesta fase.
- **Limites por plano em código** — interações de IA/mês, disparos/dia,
  número máximo de sessões, número de usuários. Calibrados depois, com uso
  real. O disjuntor + ritmo de campanha da Fase L já limitam disparos por
  segurança.
- **Trava por recurso individual** — no lançamento a Trava de plano tem só
  três pontos de aplicação. Travar Cérebro da IA, Contatos, Tags etc.
  individualmente fica para depois.
- **LGPD completo** — retenção automática, exportação de dados pelo cliente,
  anonimização. Nesta fase só Política de Privacidade + exclusão a pedido via
  script.
- **Product Design / polimento visual** — Fase 3.
- **Provisionamento automático de infraestrutura** — criar a conta Oracle,
  subir a VM, configurar HTTPS e o monitor de uptime são passos operacionais
  do fundador (ver Further Notes).

## Further Notes

Blocos operacionais (feitos pelo fundador, não são código — candidatos ao
`/wizard`):

- **Salvaguarda**: `git push` já feito — os 17 commits locais estão no GitHub
  (`feat/operacao-local-docker`).
- **Deploy**: conta Oracle Cloud + VM ARM Always Free; `docker-compose.prod.yml`
  (api, worker, dashboard, postgres, redis); `.env` de produção
  (`AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `AI_PROMPT_VERSION=v4`,
  `DASHBOARD_SESSION_SECRET`, segredo de mídia interno, credenciais de
  banco); HTTPS via `<ip>.sslip.io` com reverse proxy de certificado
  automático (Caddy ou Traefik).
- **Monitoramento**: UptimeRobot (gratuito) em
  `https://<ip>.sslip.io/health/ready`, alerta por e-mail.
- **Validação real** (no ambiente publicado, não em `localhost`): caminho Pro
  completo e caminho Grátis, conforme user stories 27 e 28.

Restrição de custo aceita: o produto roda em free tier de tudo (Oracle,
Gemini). O Gemini free tier já estoura (erro 429) em teste do próprio
fundador; com tráfego real, o comportamento de degradação graciosa existente
(avisa o cliente, joga para a fila humana) é aceito durante o lançamento.
Assim que houver o primeiro cliente Pro pagante, uma chave paga de Gemini
custa centavos e resolve.

ADRs a respeitar: #54/#55 (fila outbound at-least-once — não mexer), #99
(padrão do parâmetro booleano em `shouldAutoRespond`), #84 (enum de `stage`
fixo — não confundir com o novo enum de `plan`), #105 (registro self-service
cria tenant + owner atomicamente — o novo default `free` entra aí).
