# FASE 1 — Análise Estratégica e Roadmap de Finalização do Produto

> **Status:** Documento de referência oficial. Substitui, para efeitos de planejamento de curto prazo, a leitura direta de `PROJECT_STATUS.md`/`DECISIONS.md` como fonte de "o que falta" — aqueles continuam sendo a fonte de verdade histórica (o que foi decidido e por quê), este é o **plano de execução** da Fase 1 da nova estratégia em 5 fases.
> **Autoria:** análise conduzida como Product Manager + CTO + UX Lead + Software Architect, sobre o estado real do código, schema e documentação em 2026-07-31.
> **Escopo:** exclusivamente Fase 1 ("Finalizar o produto"). Fases 2–5 (Beta Fechado, Product Design, Infraestrutura Comercial, Escala) deliberadamente fora deste documento — citadas só quando necessário para justificar por que algo NÃO entra agora.
> **Idioma:** Português (Brasil), conforme `CLAUDE.md`.

---

## 0. Como este documento foi construído

Antes de responder qualquer uma das 10 perguntas, foi feita uma auditoria direta (não uma releitura de resumo) de: `PRODUCT_PRINCIPLES.md`, `USER_JOURNEY.md`, `DESIGN_SYSTEM.md`, `BRAND.md`, `ROADMAP.md`, `PROJECT_STATUS.md` (as 968 linhas, não só o índice), `DECISIONS.md` (ADRs #1–#89), `CLAUDE.md` §18, o `schema.prisma` completo (829 linhas), o catálogo de `Permission` do RBAC, todas as rotas REST (`presentation/*.ts` de cada bounded context) e todas as páginas do Dashboard (`pages/**/*.tsx` e `pages/api/**/*.ts`). A pasta `skills/` na raiz contém material de um projeto diferente (Ruflo/Obsidian) — não relevante ao Francis, ignorada.

O achado mais importante desta auditoria, que muda a prioridade de tudo abaixo, veio de ler a entidade `Message` e o parser do `BaileysProvider` diretamente: **o Francis hoje só entende texto.** Uma mensagem de áudio, foto, vídeo, documento ou figurinha que um cliente mande é descartada em silêncio — não vira `Message`, não aciona a IA, ninguém é notificado. Isso não estava destacado em nenhum documento existente com a gravidade que merece. Volto a isso na pergunta 4.

---

## 1. O que já está realmente concluído (como produto, não como código)

O critério aqui não é "o código existe e os testes passam" — é "um cliente real pagaria por isso sem se sentir enganado". Por esse critério:

**Conectividade WhatsApp.** Conectar via QR Code, manter a sessão viva, reconectar sozinho com backoff e circuit breaker, sobreviver a instabilidade de rede — isso está genuinamente pronto e battle-tested (passou por pelo menos 3 incidentes reais documentados: o bug do LID, o erro 463 que exigiu upgrade de major version do Baileys, e o travamento do socket por timeout ausente na busca de foto de perfil). Este é o módulo mais maduro do produto, com a dívida técnica mais bem documentada (ADRs #16, #36, #42, #47).

**IA respondendo com contexto de negócio.** O fluxo completo — mensagem chega, IA busca o "Cérebro da IA" da sessão, responde, ou admite que não sabe e escala — funciona de ponta a ponta com dois providers (Claude, Gemini) intercambiáveis por variável de ambiente. O anti-alucinação é real (a IA não responde o que não está no contexto) e o comportamento "avisa antes de escalar" é o tipo de detalhe que diferencia um produto sério de um script.

**Atendimento humano assumindo a conversa.** Um operador consegue ver que a IA pediu ajuda, assumir, responder pela própria Dashboard e devolver ao bot — sem precisar abrir o WhatsApp Web. A regra mais recente (a IA nunca se desconecta sozinha do circuito, só uma ação humana explícita tira ela) é uma decisão de produto madura, não um acidente de implementação.

**CRM básico (pipeline).** O conceito central — a IA classifica o estágio do lead automaticamente, um humano pode corrigir, e agora (após a correção desta sessão) a IA continua acompanhando a conversa sem nunca regredir uma correção — é uma funcionalidade de CRM de verdade, não uma etiqueta decorativa. Ainda tem lacunas (ver seção 2), mas o núcleo é sólido.

**Multi-tenant e RBAC.** Isolamento de dados por tenant, 5 papéis com permissões finas, hierarquia de gestão de usuários, auditoria append-only no banco (ainda sem tela — ver seção 2) — isso é trabalho de SaaS de verdade, feito cedo, o que é uma decisão correta e rara.

**Multi-sessão (Workspace × Sessão).** A reestruturação de navegação em dois níveis é o tipo de decisão arquitetural que fica muito mais cara de fazer depois que há clientes reais usando — foi feita na hora certa.

**Identidade visual mínima viável.** Marca (Francis), tokens de design, biblioteca de componentes, contrato de 4 estados (loading/vazio/erro/conteúdo) aplicado nas telas de maior tráfego (Conversas, Sessões). Não é bonito no sentido "product design premium" (isso é Fase 3, corretamente adiado), mas transmite seriedade suficiente — o P1 de `PRODUCT_PRINCIPLES.md` ("confiança antes de beleza") está atendido.

---

## 2. Lacunas em funcionalidades que já existem

Nada aqui é "não implementado" — é "implementado mas incompleto de um jeito que um cliente real vai notar".

**Cérebro da IA — só 1 nível.** O quiz e o texto livre são bons, mas o conteúdo é sempre um blob de texto solto. Não há como estruturar uma lista de produtos com preços individuais, um catálogo, ou um FAQ com múltiplas entradas pesquisáveis — tudo vira uma string. Funciona bem até ~20-30 linhas de conteúdo; começa a degradar (a IA "perde" itens no meio de um texto longo) quando o negócio tem um catálogo de verdade.

**Pipeline — falta trabalho manual básico de CRM.** O board existe e classifica sozinho, mas não dá para: criar uma conversa/lead manualmente (todo lead nasce de uma mensagem recebida — não há como cadastrar um contato que ainda não escreveu), adicionar uma nota interna sobre o lead, definir um valor estimado de negócio, ou ver quanto tempo um card está parado num estágio (o campo `stageUpdatedAt` existe no banco exatamente para isso, mas nenhuma tela usa).

**Analytics — mede a plataforma, não o negócio do cliente.** Hoje mostra uso/custo de IA, volume de mensagens, contagem de conversas. Isso é dado operacional interessante para você, mas um dono de PME quer saber: quantos leads viraram venda essa semana, qual o tempo médio de resposta, quantas conversas estão "Negociando" há mais de 3 dias. Esse dado já existe no banco (via `stage`/`stageUpdatedAt`) — falta só a pergunta certa em cima dele.

**Auditoria — existe no banco, invisível para o usuário.** `AuditLog` grava tudo, `audit:read` já é uma permissão modelada no RBAC, mas não existe rota REST nem tela. Para um Owner que quer saber "quem mudou a senha de quem" ou "quem removeu essa sessão", hoje a resposta é "abra o banco de dados".

**Gestão de usuários — sem convite real.** Hoje um Owner/Admin cria um usuário com senha provisória gerada na hora (que precisa ser comunicada a essa pessoa por fora do sistema — WhatsApp, verbalmente, sei lá). Não existe fluxo de convite por e-mail. Pequeno, mas é o tipo de fricção que incomoda um cliente logo na primeira semana de uso.

**Escalonamento — não distingue "não sei responder" de "cliente pediu humano".** O marcador de escalonamento é único. Isso bloqueia a extensão natural mais valiosa do produto (captura automática de lacunas de conhecimento, já prevista na ADR #71 itens (b)/(c)) — hoje é estruturalmente impossível saber, em massa, "quais perguntas a IA mais falha em responder" sem essa distinção.

---

## 3. O que ainda tem cara de MVP

Sendo direto, na ordem do que mais rápido quebra a confiança de um cliente pagante:

**Suporte a mídia inexistente é o maior "cheiro de MVP" do produto inteiro.** Um cliente real de WhatsApp Business manda áudio, manda foto do produto quebrado, manda print de comprovante de pagamento. Um sistema que finge que essas mensagens não existem (não loga erro, não avisa, simplesmente ignora) não é uma versão simplificada de CRM — é uma versão que vai gerar reclamação de "sumiu minha mensagem" na primeira semana de uso real. Detalhado na seção 4.

**Provisionamento manual de tenant.** Um cliente não consegue começar a usar o Francis sozinho — alguém (você) precisa rodar um script no terminal. Isso é aceitável e corretamente adiado para clientes 1 a 5 (Fase 2, Beta Fechado — você mesmo vai onboardar cada um pessoalmente), mas é a definição exata de "não é um produto, é um projeto com clientes".

**Zero tratamento de falha de rede/timeout no fluxo de IA fora do Gemini.** O `ClaudeAiProvider` não tem o mesmo retry/timeout que o `GeminiAiProvider` ganhou (documentado como YAGNI porque Claude não é o provider ativo — mas se o plano é oferecer Claude como opção premium no futuro, hoje ele quebra sem o mesmo cuidado).

**Ausência de rate limiting/anti-abuso no lado do cliente final.** Nada impede que um número malicioso mande 500 mensagens por minuto e gere 500 chamadas de IA (custo real, sem limite). Isso é invisível hoje porque você é o único usuário testando — vira risco financeiro real no primeiro beta com tráfego de verdade.

**A UI ainda mistura densidade de dados técnicos com produto.** Analytics mostra números de token e custo em dólar — informação de operador de plataforma, não de dono de salão de beleza. Isso não é "falta de polimento visual" (isso é Fase 3) — é uma pergunta de produto sobre para quem essa tela é.

---

## 4. Funcionalidades essenciais que ainda faltam existir

Aqui a régua é: "o que um CRM inteligente de atendimento via WhatsApp precisa ter para ser levado a sério", não "o que seria legal".

**Suporte a mídia (imagem, áudio, documento) — a lacuna mais crítica do produto.** Isso não é uma feature nova, é uma lacuna estrutural em cima da qual todo o resto foi construído. Sem isso: a IA não pode nunca "ver" uma foto de produto, nunca transcrever um áudio, nunca confirmar um comprovante de pagamento anexado. Um lead que manda um áudio hoje é um lead que o Francis finge que não existe. Prioridade máxima da Fase 1 — ver o roadmap detalhado na seção 8.

**Envio de mídia pelo operador.** Hoje o `MessageComposer` só manda texto. Um atendente humano que assume uma conversa não consegue mandar uma foto de catálogo, um PDF de contrato, ou um áudio — regressão funcional na comparação com simplesmente usar o WhatsApp Web.

**Templates de mensagem / respostas rápidas para o atendente humano.** Quando um humano assume, ele digita tudo do zero. Toda ferramenta de atendimento (Intercom, Crisp, Zendesk) tem "respostas salvas" — um atalho para as 10 frases que o atendente mais repete. Baixo custo de implementação, alto ganho de produtividade percebida.

**Busca de conversas por conteúdo, não só por número de telefone.** A busca hoje filtra só pelo campo de contato. Um operador com 200 conversas não tem como achar "aquela conversa que falava sobre o produto X".

**Tags/etiquetas em conversas e leads.** Complementa o `stage` (que é sequencial/funil) com uma dimensão livre — "cliente VIP", "reclamação", "aguardando pagamento". Baixíssimo custo de schema (uma tabela `Tag` + relação N:N já existe até como padrão no domínio legado descartado do projeto, é só reaproveitar o conceito).

**Horário de atendimento / disponibilidade do bot.** Hoje a IA responde 24/7 igual. Não há como configurar "responda automaticamente sempre, mas só escale para humano dentro do horário comercial" ou "fora do horário, avise que a equipe volta amanhã". Isso é comportamento básico esperado de qualquer sistema de atendimento comercial.

**Confirmação de entrega/leitura no lado do operador.** O `MessageStatus` (`SENT`/`DELIVERED`/`READ`) existe no domínio legado descartado, mas o domínio ativo (`WhatsAppMessage`) não grava status de entrega nenhum. Hoje não há como saber se uma mensagem enviada pelo Francis realmente chegou ou foi lida pelo cliente.

---

## 5. Alto impacto, baixo custo — as "vitórias rápidas"

Ordenado por relação valor percebido / esforço de implementação, do maior para o menor:

**Prévia da última mensagem na lista de conversas.** Adiado desde o M6E por exigir um campo novo — mas é exatamente o tipo de detalhe (padrão Intercom/WhatsApp Web) que faz a lista parecer um inbox de verdade em vez de uma lista de nomes. Custo: um campo desnormalizado (`lastMessagePreview`) + trigger de atualização, mesmo padrão já usado em `unreadCount`.

**Tempo parado no estágio, no card do Pipeline.** O dado (`stageUpdatedAt`) já existe. Mostrar "há 4 dias sem mudança" em cada card é uma linha de UI que transforma o board de "bonito" em "eu confio nisso para gerir minhas vendas".

**Toast/confirmação de "mensagem entregue" no MessageComposer.** Pequeno, mas fecha o loop de confiança (P3 de `PRODUCT_PRINCIPLES.md`, "o usuário nunca fica no escuro") no momento mais tenso do produto — mandar uma resposta para um cliente esperando.

**Auditoria com tela simples de leitura.** O backend (`AuditLog`) e a permissão (`audit:read`) já existem. Uma tabela paginada — sem filtro sofisticado, só listar — é um dia de trabalho e fecha uma lacuna de confiança para o Owner.

**Aviso de horário/rate limit simples.** Um campo de configuração por sessão ("responder fora do expediente: sim/não" + texto de aviso) sem nenhuma automação sofisticada de agendamento — resolve 80% do problema descrito na seção 4 com 20% do esforço.

**Respostas rápidas do atendente (versão mínima).** Uma lista fixa de texto configurável por tenant, sem categorização nem atalho de teclado — já ajuda muito.

---

## 6. Decisões arquiteturais para tomar agora, antes do beta

Esta é a pergunta mais importante do documento, porque errar aqui custa dias depois que houver dados reais de cliente.

**Decidir o modelo de mídia AGORA, mesmo que a implementação completa espere.** Mesmo que "suporte completo a mídia" seja um bloco grande (seção 8), a decisão de _onde_ ela vive (novo campo `WhatsAppMessage.mediaUrl`/`mediaType`, ou uma tabela `Attachment` separada como no domínio legado) precisa ser tomada antes que existam milhares de mensagens de texto no banco — trocar depois é uma migration de dado, não só de schema.

**Formalizar o "AiInteraction ↔ Message ↔ pergunta original" antes de crescer a base de conversas.** Hoje `AiInteraction` não linka à mensagem inbound que originou a resposta. Cada dia que passa sem essa ligação é uma janela de dados que a futura "captura automática de lacunas de conhecimento" (o item mais valioso do roadmap de IA, ADR #71 itens b/c) nunca vai poder reconstruir retroativamente.

**Decidir agora se `stage` fica fixo em código ou vira configurável por tenant.** A decisão atual (funil fixo de 5 estágios, YAGNI documentado) é certa para 1 cliente. No momento em que o segundo cliente beta pedir um estágio diferente ("Proposta Enviada" em vez de "Negociando"), ou você aceita mudar o enum toda vez (migration por cliente, insustentável), ou generaliza agora enquanto só existe um schema para migrar. Não implementar customização agora — só decidir a direção antes de ter dados de produção que dificultem a migração.

**Rate limiting por tenant/sessão no consumo de IA, antes que exista tráfego real.** Hoje nada impede um custo de IA descontrolado. É uma decisão arquitetural (onde o limite vive — Domain policy? campo de config? Redis?) que fica dramaticamente mais arriscada de retrofitar depois que há uso de produção gerando fatura.

**Formalizar contratos de idempotência de mensageria antes de mais volume.** A ADR #54/#55 já registra que o envio outbound é "at-least-once", não exactly-once — aceitável em baixo volume, perigoso (mensagem duplicada para o cliente) em escala. Decidir a chave de idempotência definitiva agora é mais barato que descobrir duplicatas em produção.

**Formalizar versionamento de prompt de forma que sobreviva a treinar/trocar de modelo.** `PromptVersion` já existe como registro estático — bom. O que falta decidir agora é: quando o Cérebro da IA v2 (captura automática de aprendizado) chegar, o prompt vai ficar acoplado ao texto livre do tenant do jeito que está, ou precisa de uma camada de "system prompt versionado" separada do conteúdo do tenant? Decidir isso barato agora evita reescrever o `PromptBuilder` inteiro depois.

**Decidir a política de retenção de dados agora (LGPD).** Um produto que guarda conversas reais de clientes de PMEs brasileiras tem obrigação legal de LGPD. Hoje não existe política de retenção, exclusão a pedido, nem anonimização. Não precisa ser implementado na Fase 1, mas a arquitetura de "como apagar os dados de um contato quando pedido" deveria ser desenhada antes de ter uma base de conversas grande o suficiente para isso ser doloroso.

---

## 7. O que estamos esquecendo completamente

Pensando com a cabeça de quem já viu Intercom, HubSpot, Zendesk, Crisp e Pipedrive por dentro — não para copiar feature, mas para extrair o conceito que falta:

**Um "resumo de conversa" gerado por IA.** Toda ferramenta de atendimento séria (Intercom, Zendesk) tem um botão "resumir esta conversa" para quando um segundo atendente assume um caso longo. O Francis já tem a IA rodando — isso é reaproveitar a mesma infraestrutura para uma função de altíssimo valor percebido e baixíssimo custo incremental.

**SLA / tempo de primeira resposta como métrica de produto, não de operação.** HubSpot e Zendesk vendem "tempo médio de primeira resposta" como o número que convence o dono do negócio de que a ferramenta vale a pena. O Francis tem os timestamps para calcular isso (`occurredAt` de toda mensagem) e não expõe essa métrica em lugar nenhum — é provavelmente o número que mais vende o produto e ele não existe hoje.

**Broadcast/campanha simples (mesmo que rudimentar).** O `ROADMAP.md` já registra "CRM Core" (leads/campanhas) como backlog nunca iniciado, e isso está corretamente fora de escopo por ora — mas vale nomear explicitamente: em algum momento pós-Fase-1, "mandar uma mensagem para todos os leads parados em Negociando há mais de 5 dias" é o tipo de funcionalidade que fecha o círculo do CRM (hoje o Francis só reage a mensagens recebidas, nunca inicia contato).

**Exportação de dados.** Não existe um jeito de o cliente tirar os dados dele do sistema (CSV de conversas, de leads). Isso é ao mesmo tempo uma expectativa básica de qualquer SaaS sério e uma obrigação indireta de LGPD (portabilidade de dados).

**Um "modo de teste" para o dono experimentar a IA sem incomodar cliente real.** Hoje a única forma de testar o Cérebro da IA é mandar mensagem de um número real para o WhatsApp conectado. Um simulador de conversa dentro da própria tela do Cérebro da IA ("teste aqui o que a IA responderia") é barato de fazer e reduz o medo de configurar errado e assustar um cliente de verdade.

**Confirmação de que o número de WhatsApp é elegível/seguro antes de conectar.** Nada no fluxo de conexão avisa o dono do negócio dos riscos reais já vividos neste projeto (números novos sofrendo rate-limit do WhatsApp, como o incidente do erro 463). Um aviso simples na tela de conexão ("evite números muito novos, o WhatsApp pode limitar o envio nos primeiros dias") transformaria um incidente técnico já sofrido internamente em conhecimento protegendo o próximo cliente.

---

## 8. Crítica direta ao que foi proposto

Você pediu para eu não concordar automaticamente. Aqui está onde discordo ou ajusto:

**A separação "Fase 1 sem preocupação visual" tem um risco real: mídia e visual não são totalmente separáveis.** Mostrar uma foto recebida do cliente, ou uma mensagem de áudio com player, é ao mesmo tempo uma funcionalidade essencial (Fase 1) e uma peça de UI nova (bolha de mídia na timeline). Não dá para implementar suporte a mídia "sem nenhum cuidado visual" — o mínimo (uma bolha de imagem, um player de áudio HTML nativo) é inevitável. Recomendo tratar isso explicitamente: a funcionalidade é Fase 1, o refinamento visual dessa mesma peça (animações, preview elegante) é que fica para a Fase 3.

**O Pipeline, do jeito que está, ainda não é "essencial" no sentido que você está tratando — é importante mas secundário frente à lacuna de mídia.** Você investiu boa parte dos últimos dias resolvendo bugs do Pipeline (justificadamente, era um bug real e visível). Mas se eu tivesse que escolher entre "Pipeline perfeito" e "suporte básico a áudio/imagem" para o beta fechado, escolheria mídia sem hesitar — é a diferença entre "meu CRM tem um bug de classificação" (irritante, mas o produto continua funcionando) e "meu CRM não responde quando o cliente manda um áudio" (o produto simplesmente falha na frente do lead).

**Considero legítimo questionar se o quiz "Assistente Guiado" do Cérebro da IA já entregou valor suficiente para justificar mais investimento nele agora.** Foi bem executado, mas ele resolve o mesmo problema (estruturar o conhecimento do negócio) que o suporte a catálogo estruturado (seção 4) resolveria melhor. Não recomendo desfazer o quiz — mas recomendo não expandir essa frente até decidir se o caminho de longo prazo é "quiz melhor" ou "estrutura de dados melhor por trás do texto livre".

**O RBAC de 5 papéis fixos é uma decisão correta hoje, mas está sendo tratado como mais definitivo do que deveria.** Já vi o padrão se repetir 3 vezes no histórico do projeto (Analytics, Cérebro da IA, agora potencialmente `stage`) de "fixo em código, YAGNI, generalizar quando houver 2º caso de uso real" — é uma boa heurística, mas cada vez que ela se aplica a algo que toca DIRETAMENTE a experiência do cliente do beta (não só arquitetura interna), o risco de precisar quebrar contrato com cliente real pagando é maior que o risco de "abstração especulativa". Recomendo, especificamente para RBAC e para `stage`, reavaliar essa heurística antes (não durante) o Beta Fechado.

**Divirjo parcialmente da prioridade "Pipeline > Analytics de negócio".** Você tratou o Pipeline como uma entrega grande recente e o Analytics de negócio real (seção 2) nem apareceu no seu pedido original. Na minha leitura, sem uma métrica de "quanto isso está funcionando para mim" (tempo de resposta, taxa de conversão do funil), o Owner de uma PME não vai saber avaliar se vale pagar pelo Francis depois do período de teste — Analytics de negócio é, na prática, parte do que fecha a venda do próprio SaaS, não um extra.

---

## 9. Roadmap detalhado da Fase 1

Formato idêntico ao já usado nas milestones anteriores do projeto. Numeração `F1.1`, `F1.2`... para não colidir com M0–M7 existentes (este roadmap vive DENTRO do que hoje é tratado como trabalho pós-M6/pré-M7, mas reorganizado pela nova estratégia de 5 fases).

### F1.1 — Suporte a mensagens de mídia (recebimento)

**Objetivo:** o Francis reconhece, persiste e sinaliza mensagens de imagem, áudio, documento e figurinha recebidas — mesmo que a IA ainda não "veja" o conteúdo desta mensagem nesta primeira fase.

**Justificativa:** é a lacuna mais crítica identificada (seção 3/4) — hoje essas mensagens são descartadas em silêncio. É a base sem a qual F1.2/F1.3 não fazem sentido.

**Impacto:** altíssimo. Sem isso, uma fração real de conversas de clientes reais simplesmente "some".

**Módulos afetados:** `services/whatsapp` (Domain: `WhatsAppProviderEvent`; Infrastructure: `BaileysProvider`), `services/conversations` (Domain: `Message`; Infrastructure: `PrismaMessageRepository`), schema Prisma, `apps/dashboard` (`MessageBubble`/`MessageTimeline`).

**Riscos:** tamanho de payload (mídia do WhatsApp vem como referência criptografada, não como arquivo pronto — decisão de baixar e persistir vs. servir sob demanda via Baileys precisa ser tomada); custo de armazenamento se optar por baixar tudo.

**Critérios de aceite:** uma mensagem de imagem/áudio/documento/figurinha enviada por um contato real vira uma `Message` persistida com `mediaType` e alguma forma de acesso ao conteúdo (URL assinada ou proxy); a timeline mostra um placeholder correto por tipo (não quebra, não mostra texto vazio); a IA, ao encontrar uma mensagem de mídia no histórico, sabe dizer honestamente "recebi uma [imagem/áudio], mas ainda não consigo interpretar o conteúdo" em vez de ficar muda ou alucinar.

**Ordem recomendada:** primeiro bloco da Fase 1, sem dependências.

**Dependências:** nenhuma.

**Arquivos envolvidos (principais):** `BaileysProvider.ts` (extração do tipo de mensagem, hoje só `conversation`/`extendedTextMessage.text`), `WhatsAppProviderEvent.ts`, `Message.ts` (Domain), `PrismaMessageRepository.ts`, migration Prisma nova, `MessageTimeline.tsx`, `MessageBubble.tsx` (componente novo por tipo).

**ADR necessária:** sim — decisão de armazenamento (baixar e persistir vs. proxy sob demanda) e decisão de schema (campo novo vs. tabela `Attachment` — ver seção 6).

---

### F1.2 — Interpretação de mídia pela IA (transcrição de áudio + leitura de imagem)

**Objetivo:** a IA consegue responder com base no conteúdo real de um áudio (transcrito) ou de uma imagem (descrita/analisada) recebida, não só saber que "existe uma mídia".

**Justificativa:** completa o valor de F1.1 — sem isso, o cliente ainda sente que "o Francis não entende o que eu mando", só que agora educadamente em vez de silenciosamente.

**Impacto:** altíssimo — provavelmente o segundo maior salto de percepção de qualidade depois do próprio autoresponder original.

**Módulos afetados:** `services/ai` (novo adapter de transcrição/visão — Claude e Gemini já suportam input de áudio/imagem nativamente nas suas APIs modernas, então isso pode reaproveitar o mesmo provider em vez de um serviço à parte), `PromptBuilder`.

**Riscos:** custo por chamada de IA sobe (processar áudio/imagem custa mais que texto) — reforça a urgência do rate limiting (seção 6); latência de resposta sobe.

**Critérios de aceite:** um áudio simples ("oi, vocês têm o produto X?") gera uma resposta da IA coerente com o conteúdo falado; uma imagem de um produto ou de um comprovante é reconhecida na resposta da IA de forma útil (mesmo que só "recebi a imagem, vou verificar" quando não houver contexto suficiente — nunca alucinar sobre o conteúdo).

**Ordem recomendada:** logo após F1.1.

**Dependências:** F1.1.

**Arquivos envolvidos:** `ClaudeAiProvider.ts`/`GeminiAiProvider.ts` (suporte a input multimodal), `ConversationAiService.ts`, `PromptBuilder.ts`.

**ADR necessária:** sim — escolha entre multimodal nativo do provider vs. serviço de transcrição dedicado (ex.: Whisper), e decisão de custo/orçamento por interação.

---

### F1.3 — Envio de mídia pelo operador humano

**Objetivo:** o `MessageComposer` permite anexar e enviar imagem/documento/áudio, não só texto.

**Justificativa:** paridade mínima com simplesmente usar o WhatsApp Web — hoje um atendente humano tem MENOS capacidade dentro do Francis do que fora dele.

**Impacto:** alto para quem já assumiu conversas manualmente; sem isso, todo atendimento humano de mídia obriga a sair da Dashboard.

**Módulos afetados:** `services/whatsapp` (`sendMessage` precisa aceitar mídia), `services/conversations` (`ConversationsService.sendAgentMessage`), BFF, `MessageComposer.tsx`.

**Riscos:** upload de arquivo do navegador para o backend precisa de um caminho de armazenamento temporário — mesma decisão de F1.1 se resolve aqui em conjunto.

**Critérios de aceite:** um operador consegue anexar uma imagem/PDF e enviá-la; a mensagem aparece na timeline com o mesmo tratamento visual de uma mídia recebida; falha de envio de mídia usa o mesmo padrão de toast/erro já estabelecido.

**Ordem recomendada:** após F1.1 (compartilha decisão de armazenamento).

**Dependências:** F1.1.

**Arquivos envolvidos:** `MessageComposer.tsx`, `ConversationsService.ts`, `OutboundMessageCommand`, `BaileysProvider.sendMessage`.

**ADR necessária:** não — reaproveita a decisão de armazenamento já tomada em F1.1.

---

### F1.4 — Vínculo `AiInteraction` ↔ mensagem inbound + distinção "não sei" vs. "pediu humano"

**Objetivo:** toda interação de IA sabe exatamente qual pergunta a originou, e o marcador de escalonamento distingue os dois motivos.

**Justificativa:** decisão arquitetural que fica mais cara quanto mais tarde for tomada (seção 6) — é o pré-requisito direto da funcionalidade de maior valor futuro do roadmap de IA (captura automática de lacunas, ADR #71 b/c), hoje impossível de reconstruir retroativamente.

**Impacto:** médio agora, altíssimo como fundação do que vem depois.

**Módulos afetados:** `services/ai` (`AiInteraction`, `escalationSignal.ts`), schema Prisma.

**Riscos:** baixo — é uma extensão aditiva de um modelo já existente.

**Critérios de aceite:** toda `AiInteraction` grava o `messageId` da pergunta que a originou; o marcador de escalonamento (`[[ESCALAR_HUMANO]]`) ganha uma variante ou parâmetro que distingue "não sei responder" de "cliente pediu atendente"; uma consulta simples já consegue listar "as N perguntas mais recentes que a IA não soube responder".

**Ordem recomendada:** pode rodar em paralelo a F1.1–F1.3 (módulo diferente).

**Dependências:** nenhuma.

**Arquivos envolvidos:** `AiInteraction.ts`, migration, `escalationSignal.ts`, `PromptVersion.ts`, `AiReplyJobProcessor.ts`.

**ADR necessária:** sim — pequena, mas registra a mudança de contrato do marcador de escalonamento.

---

### F1.5 — Painel de auditoria (leitura)

**Objetivo:** uma tela simples, paginada, mostrando o `AuditLog` do tenant — quem fez o quê e quando.

**Justificativa:** vitória rápida (seção 5) — backend e permissão já existem, é a lacuna de confiança mais barata de fechar.

**Impacto:** médio, mas de alto valor de confiança para o Owner.

**Módulos afetados:** `services/auth` (rota nova, reaproveitando `AuditLogRepository` já existente), `apps/dashboard` (página nova em `/sessions/:sessionName/... ` ou tenant-wide, a decidir).

**Riscos:** baixíssimo.

**Critérios de aceite:** `GET /api/tenants/:tenantId/audit-logs` paginado por cursor; tela lista ator, ação, alvo e data; visível só para quem tem `audit:read` (Owner/Administrator).

**Ordem recomendada:** pode rodar a qualquer momento, é isolado. Bom "bloco de respiro" entre F1.1–F1.4 (mais pesados) e F1.6+.

**Dependências:** nenhuma.

**Arquivos envolvidos:** novo `auditLogRouter.ts`, BFF `pages/api/audit-logs/*`, nova página `audit-logs.tsx`.

**ADR necessária:** não — é a aplicação direta de uma decisão (RBAC, `AuditLog`) já tomada.

---

### F1.6 — Analytics de negócio (funil, tempo de resposta, conversão)

**Objetivo:** substituir/complementar o Analytics atual (uso/custo de IA) por métricas que o dono do negócio realmente usa para decidir: tempo médio de primeira resposta, quantos leads por estágio, taxa de conversão do funil, tempo médio parado em cada estágio.

**Justificativa:** identificada como esquecimento real (seção 7) — é provavelmente o que mais ajuda a vender a permanência do cliente no produto.

**Impacto:** alto — conecta diretamente ao valor de negócio percebido pelo cliente pagante.

**Módulos afetados:** `services/analytics` (novos métodos de agregação sobre `WhatsAppConversation.stage`/`stageUpdatedAt`/`occurredAt` da primeira mensagem outbound), `apps/dashboard` (`analytics.tsx` ou nova aba).

**Riscos:** cálculo de "tempo de primeira resposta" cruza `WhatsAppMessage` inbound × outbound — precisa de cuidado para não ficar caro em tenants com muito volume (mesma disciplina D51 de read-only/sem rollup, já estabelecida).

**Critérios de aceite:** o Owner consegue ver, sem precisar entender token/custo, quantos leads entraram essa semana, quantos avançaram de estágio, e o tempo médio de primeira resposta.

**Ordem recomendada:** depois de F1.1–F1.4 (não depende deles tecnicamente, mas é menos urgente que a lacuna de mídia).

**Dependências:** nenhuma técnica; recomendado depois de F1.1 por prioridade de produto.

**Arquivos envolvidos:** `AnalyticsRepository.ts`, `PrismaAnalyticsRepository.ts`, `AnalyticsService.ts`, `analytics.tsx`.

**ADR necessária:** sim — define quais métricas de negócio entram nesta primeira rodada (evitar escopo infinito).

---

### F1.7 — Vitórias rápidas de UI funcional (prévia de mensagem, tempo parado no estágio, toast de entrega)

**Objetivo:** empacotar as vitórias de baixo custo da seção 5 que ainda não têm bloco próprio: prévia da última mensagem na lista de conversas, "há N dias neste estágio" no card do Pipeline, confirmação clara de envio no `MessageComposer`.

**Justificativa:** alto impacto percebido por esforço muito baixo (seção 5).

**Impacto:** médio-alto, mas barato — bom para intercalar entre blocos maiores.

**Módulos afetados:** `services/conversations` (campo desnormalizado de prévia, mesmo padrão de `unreadCount`), `ConversationListItem.tsx`, `PipelineCard.tsx`, `MessageComposer.tsx`.

**Riscos:** baixo.

**Critérios de aceite:** lista de conversas mostra um trecho da última mensagem; card do Pipeline mostra "há X dias" desde `stageUpdatedAt`; enviar mensagem dá feedback imediato e inequívoco de sucesso/falha.

**Ordem recomendada:** intercalado — pode ser feito em paralelo a qualquer outro bloco por times/sessões diferentes, ou como "bloco de respiro".

**Dependências:** nenhuma.

**Arquivos envolvidos:** migration pequena (campo de prévia), `PrismaConversationRepository.ts`, `ConversationListItem.tsx`, `PipelineCard.tsx`.

**ADR necessária:** não.

---

### F1.8 — Horário de atendimento / disponibilidade configurável — ✅ implementado (2026-08-01)

**Objetivo:** permitir configurar, por sessão, se a IA deve avisar sobre horário de atendimento fora do expediente, com um texto customizável.

**Justificativa:** comportamento básico esperado (seção 4), baixo custo se implementado na versão mínima (sem agendamento sofisticado).

**Impacto:** médio — evita a percepção de "atendimento robótico 24h sem noção de horário comercial".

**Módulos afetados:** `services/ai` (novo campo de configuração, possivelmente no próprio `AiBusinessProfile` ou uma extensão dele), `PromptBuilder`.

**Riscos:** baixo, mas cuidado para não conflitar com a regra de nunca deixar o cliente no silêncio (comportamento já implementado) — "fora do horário" deve ainda responder, só com uma expectativa diferente, nunca silêncio total.

**Critérios de aceite:** o dono do negócio configura um texto de "fora do horário"; a IA usa esse texto quando a mensagem chega fora da janela configurada, sem deixar de responder.

**Ordem recomendada:** depois de F1.6, não bloqueante.

**Dependências:** nenhuma técnica.

**Arquivos envolvidos:** schema (campo novo, aditivo), `AiProfilePanel.tsx` (nova seção de configuração), `PromptBuilder.ts`.

**ADR necessária:** pequena — decide onde essa configuração vive no schema.

**Status real:** entregue como campos aditivos em `AiBusinessProfile` (`offHoursEnabled`/`offHoursMessage`/`workingHoursStart`/`workingHoursEnd`/`workingDays`/`timezone`), consumidos por `PromptBuilder`. Ver DECISIONS.md ADR #98, CLAUDE.md §18 ("F1.8").

---

### F1.9 — Respostas rápidas (templates) para o atendente humano — ✅ implementado (2026-08-05)

**Objetivo:** uma lista simples e configurável de textos prontos que o atendente pode inserir com um clique no `MessageComposer`.

**Justificativa:** vitória rápida de produtividade percebida (seção 4/5), padrão universal em ferramentas de atendimento.

**Impacto:** médio — melhora a experiência de quem já atende manualmente, sem mudar arquitetura nenhuma.

**Módulos afetados:** novo model simples (`QuickReply` ou similar) por tenant/sessão, `MessageComposer.tsx`.

**Riscos:** baixo.

**Critérios de aceite:** um Administrator cadastra frases prontas; o atendente as vê e insere com um clique ao responder uma conversa.

**Ordem recomendada:** último bloco "de produto" antes do fechamento da fase — é o de menor urgência relativa, mas mantém o momentum de entregas pequenas e visíveis.

**Dependências:** nenhuma.

**Arquivos envolvidos:** migration nova, novo router simples, `MessageComposer.tsx`.

**ADR necessária:** não.

**Status real:** entregue como bounded context `services/quickReplies`. Ver PROJECT_STATUS.md §40, CLAUDE.md §18 ("F1.9").

---

### F1.10 — Decisões arquiteturais registradas, sem implementação completa nesta fase — ⚠️ REESCOPADO em 2026-08-08 (virou bloco de implementação real, não só decisões)

Escopo ORIGINAL deste bloco (mantido abaixo, riscado o que não avançou): não era uma entrega de funcionalidade, e sim a formalização de decisões da seção 6 em ADR, mesmo sem implementação plena:

- ~~Rate limiting de consumo de IA por tenant/sessão~~ → **implementado de verdade** (não só decidido) — ver abaixo.
- Estratégia de retenção/exclusão de dados (LGPD) — **ainda não endereçada**, segue como decisão pendente.
- Direção sobre customização futura de `stage` por tenant — **ainda não endereçada**, segue fixo em código (YAGNI mantido).
- Estratégia de idempotência definitiva do envio outbound (fechar a lacuna "at-least-once" da ADR #54/#55) — **ainda não endereçada**, risco residual conhecido, sem mudança nesta rodada.

**O que realmente aconteceu (2026-08-08)**: antes de abrir o beta fechado, o fundador pediu uma auditoria técnica completa da plataforma. Ela encontrou 3 riscos P0 concretos (não hipóteses de design) — worker de IA sem concorrência configurada, ausência real de rate limiting (não só "decisão pendente"), e `useConversationDetail` varrendo até 1000 conversas por poll — mais um pedido de produto antigo nunca fechado (pop-up de handoff humano) e itens de estabilidade menores (índice de banco, isolamento por tenant do cache de mídia, teto de upload, validação de Content-Type, teste de regressão de LID, teste flaky). Todos os 3 P0 + o pop-up + os itens menores foram **implementados, testados (incluindo 2 testes de integração real contra Postgres/Redis) e documentados** na mesma rodada — não ficaram só como ADR de intenção. Ver DECISIONS.md ADR #102 e CLAUDE.md §18 ("Fase 1, Bloco F1.10") para o detalhe completo.

**Pendências que continuam em aberto** (não fechadas por F1.10, registradas para não serem perdidas): retenção/exclusão de dados (LGPD), customização de `stage` por tenant, idempotência definitiva do outbound. Nenhuma delas bloqueia o beta fechado inicial (baixo volume, poucos tenants) — ficam como candidatas a um F1.11 ou item de Fase 2, a critério do fundador.

---

## 10. Ordem de execução recomendada (visão consolidada)

1. **F1.1** — Suporte a mídia (recebimento). Bloqueia tudo relacionado a mídia. ✅ implementado.
2. **F1.4** — Vínculo AiInteraction↔Message + distinção de escalonamento (paralelo ao item 1, times/sessões diferentes se houver). ✅ implementado.
3. **F1.2** — Interpretação de mídia pela IA. ✅ implementado.
4. **F1.3** — Envio de mídia pelo operador. ✅ implementado.
5. **F1.5** — Painel de auditoria (bloco de respiro, curto). ✅ implementado.
6. **F1.6** — Analytics de negócio. ✅ implementado.
7. **F1.7** — Vitórias rápidas de UI funcional (pode intercalar a qualquer momento a partir daqui). ✅ implementado.
8. **F1.8** — Horário de atendimento. ✅ implementado.
9. **F1.9** — Respostas rápidas. ✅ implementado.
10. **F1.10** — Reescopado (ver seção acima): fechou os P0 da auditoria pré-beta + pop-up de handoff + estabilidade menor. ✅ implementado (2026-08-08); LGPD/customização de `stage`/idempotência do outbound seguem em aberto.

**Trabalho ad-hoc, fora desta sequência numerada** (pedidos diretos do fundador, implementados entre F1.9 e F1.10, retroativamente documentados em 2026-08-08 — ver `DECISIONS.md` ADRs #99–#101): Botão POWER da IA por sessão, catálogo de tags por sessão + atribuição a conversas, resumo de conversa gerado por IA sob demanda, fix crítico de LID (Baileys v7, `senderPn`→`remoteJidAlt`). Todos ✅ implementados e testados.

**A Fase 1 (F1.1–F1.10 + trabalho ad-hoc) está, portanto, CONCLUÍDA em 2026-08-08.** O próximo passo lógico é a Fase 2 (Beta Fechado) — ver `CLAUDE.md` §18 para o estado mais recente e qualquer decisão nova do fundador antes de iniciá-la.

---

## 11. Veredito do CTO

Se o Francis fosse minha empresa, esta seria a ordem exata em que eu construiria o restante do produto — e a razão para essa ordem é uma só: **hoje o Francis finge para si mesmo que todo cliente de WhatsApp só manda texto, e isso é falso para praticamente qualquer negócio real.** Todo o resto que vocês construíram — o pipeline, o multi-tenant, a reconexão resiliente, o RBAC — é trabalho de engenharia genuinamente maduro, mais maduro do que a maioria dos MVPs que eu já vi chegar em beta. Mas maturidade de arquitetura não compensa uma lacuna de produto que vai aparecer na primeira semana de uso real, quando o primeiro lead mandar um áudio perguntando o preço e não receber resposta nenhuma.

Por isso a mídia vem antes de tudo, inclusive antes de mais polimento no Pipeline (que já está bom o suficiente para validar) e antes do Analytics de negócio (que é importante, mas não quebra a experiência do lead final se demorar mais duas semanas para existir).

A segunda prioridade, que eu recomendo tratar com o mesmo peso institucional que vocês já deram ao Pipeline, é abrir a porta de dados para o que vem depois: o vínculo `AiInteraction`↔`Message` (F1.4) não entrega nada visível a um cliente, mas é o tipo de decisão que, se adiada, transforma "captura automática de lacunas de conhecimento" — o item que vocês mesmos já identificaram como o mais valioso do roadmap de IA — em um projeto de arqueologia de dados daqui a três meses, em vez de uma extensão natural do que já existe.

Sobre a estratégia de 5 fases em si: concordo com a sequência e, em particular, concordo fortemente com adiar o Product Design (Fase 3) para depois do Beta Fechado — é comum a tentação de "deixar bonito antes de mostrar para alguém", e vocês já resistiram a essa tentação uma vez (na decisão de M6 vs. M2 original). A única correção que eu faria ao enquadramento original é: "sem preocupação com perfeição visual" não significa "zero decisão de UI" — mídia, em particular, exige uma peça de interface nova (bolha de imagem, player de áudio) que não dá para adiar para a Fase 3 sem adiar a própria funcionalidade essencial junto.

Estou pronto para começar pelo F1.1 assim que você confirmar a direção — ou para discutir qualquer um dos pontos onde divergi antes de travar o plano.

---

_Este documento é a referência oficial da Fase 1 a partir de 2026-07-31. Qualquer divergência deve ser discutida e registrada aqui antes de virar código, seguindo a mesma disciplina já estabelecida para `PRODUCT_PRINCIPLES.md`/`DECISIONS.md`._
