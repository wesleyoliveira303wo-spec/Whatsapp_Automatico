# USER_JOURNEY.md

> **Idioma:** Português (Brasil), conforme política oficial do projeto (`CLAUDE.md`).
> **Status:** Fonte de verdade da jornada do usuário. Toda tela e fluxo da Milestone 6 (Product Experience) deve ser rastreável a um momento desta jornada. Complementa `PRODUCT_PRINCIPLES.md` (o _porquê_) mapeando o _quando_ e o _onde_.
> **Autoria:** Head of Product + UX Designer.
> **Escopo:** cobre o estado ATUAL do produto (o que já existe e é validado) e marca claramente o que ainda NÃO existe (ex.: signup automático), para o retrofit da M6 não assumir telas inexistentes.

---

## 0. Os atores

A plataforma tem dois lados: **quem opera** (a empresa cliente do SaaS) e **quem é atendido** (o lead/cliente final no WhatsApp). A jornada de UI é do primeiro grupo; o segundo aparece porque tudo que o operador faz existe para servi-lo.

| Ator                                        | Quem é                                                           | Onde vive                              | Nível técnico |
| ------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------- | ------------- |
| **Owner**                                   | Dono da empresa cliente. Primeiro usuário criado, poder máximo.  | Dashboard                              | Baixo         |
| **Administrator**                           | Gestor de equipe. Gerencia usuários abaixo dele, configura a IA. | Dashboard                              | Baixo/médio   |
| **Atendente** (agent/viewer, conforme RBAC) | Quem assume conversas e responde clientes.                       | Dashboard, muitas vezes no **celular** | Baixo         |
| **Lead / cliente final**                    | A pessoa que manda mensagem no WhatsApp da empresa.              | WhatsApp (celular dele)                | Irrelevante   |
| **Administrador da plataforma (você)**      | Provisiona clientes hoje **manualmente** (scripts CLI).          | Terminal                               | Alto          |

> **Nota de realidade:** hoje NÃO existe signup automático. Um cliente novo entra na plataforma porque você roda `createOwner.ts` + `issueApiKey.ts` no banco. A jornada abaixo começa, para o cliente, no **primeiro login** — não num cadastro. Isso é intencional (ver análise estratégica da M6) e a M6 não deve inventar telas de signup.

---

## 1. Visão macro da jornada

```
[Provisionamento manual]  →  Primeiro acesso  →  Conectar WhatsApp  →  IA no ar
   (você, fora da UI)          (login + senha)      (QR Code)          (respondendo leads)
                                                                            │
                                                                            ▼
Uso diário  ←  Configurar o "Cérebro da IA"  ←  Primeira conversa real  ←  Lead escreve
    │
    ├─ Monitorar conversas (bot atendendo)
    ├─ Ser notificado quando a IA escala para humano
    ├─ Assumir e responder pela Dashboard
    ├─ Acompanhar métricas (Analytics)
    └─ Gerir equipe (Owner/Admin)
```

Cada seta é um ponto onde o usuário pode ter sucesso, hesitar, ou desistir. As seções abaixo detalham cada um, com o **estado emocional**, o **atrito atual** e o **que a M6 precisa entregar**.

---

## 2. Fase 1 — Primeiro acesso

### 2.1 Contexto

O cliente recebeu de você um e-mail, uma senha provisória e um link. Ele nunca viu o produto. Está curioso e um pouco cético ("será que funciona mesmo?").

### 2.2 Passos

1. Abre o link → cai na **tela de login**.
2. Entra com e-mail + senha provisória.
3. Sistema exige **troca de senha obrigatória** (`must_change_password`, já implementado).
4. Cai na Dashboard pela primeira vez.

### 2.3 Estado emocional

Cético → avaliando. Esta é a **primeira impressão** — o P1 (confiança antes de beleza) é decidido aqui em segundos.

### 2.4 Atrito atual (a corrigir na M6)

- A tela de login parece protótipo (sem marca, sem identidade). Um cliente cético olhando uma tela crua fica mais cético.
- Sem favicon/título: a aba do navegador não diz nem o nome do produto.
- Após o login, o usuário cai numa Dashboard que, se não tem sessão conectada, mostra... o quê? (ver Fase 2 — é o estado vazio mais crítico do produto).

### 2.5 O que a M6 entrega aqui

Login e troca de senha com identidade visual v1, marca visível, títulos de aba. A porta de entrada tem que passar confiança (P1).

---

## 3. Fase 2 — Conectar o WhatsApp (o momento da verdade)

### 3.1 Contexto

Sem WhatsApp conectado, o produto não faz nada. Esta é a ativação — o momento em que o cliente passa de "cadastrado" para "usuário ativo". Se ele trava aqui, perdemos o cliente.

### 3.2 Passos

1. Dashboard indica que não há sessão ativa → precisa de um estado vazio que **guie** para "conectar".
2. Cria/abre uma sessão → aparece o **QR Code**.
3. Abre o WhatsApp no celular → escaneia.
4. Status muda: conectando → conectado (feedback em tempo real, ~2s de polling, já implementado).

### 3.3 Estado emocional

Ansioso ("vai funcionar?") → aliviado/animado quando conecta. O feedback de status em tempo real é o que transforma ansiedade em confiança.

### 3.4 Atrito atual (a corrigir na M6)

- **Estado vazio de "nenhuma sessão" é o ponto mais crítico e hoje é o mais fraco.** Uma lista vazia sem contexto aqui = cliente perdido logo no início (viola P6 diretamente).
- O QR Code precisa de instrução clara ao lado ("Abra o WhatsApp > Aparelhos conectados > Conectar aparelho") — o usuário não técnico não sabe o que fazer com um QR sozinho.
- Transições de status precisam ser visíveis e tranquilizadoras (skeleton/estado, não um pulo abrupto).

### 3.5 O que a M6 entrega aqui

O **empty state guiado** de ativação (prioridade máxima do bloco M6D/M6E), QR com instrução passo a passo, feedback de conexão claro. Este é o retrofit de maior impacto no funil.

---

## 4. Fase 3 — Ensinar a IA (o "Cérebro da IA")

### 4.1 Contexto

Com o WhatsApp conectado, a IA já responde — mas genérico. O cliente descobre que pode "ensinar" a IA sobre o negócio dele (quem é, o que vende, preços, horários) — a Base de Conhecimento Nível 1, já implementada.

### 4.2 Passos

1. Acessa a tela "Cérebro da IA".
2. Escreve, em texto livre, sobre o negócio.
3. Salva → a próxima resposta da IA já usa esse contexto.

### 4.3 Estado emocional

Curioso → encantado (é o momento "uau": a IA passa a falar como se conhecesse a empresa). Este é um **momento de ativação de valor** — quando o cliente entende por que o produto vale.

### 4.4 Atrito atual (a corrigir na M6)

- A tela é uma textarea crua. Falta orientação: exemplos, dica do que escrever, contador de limite amigável.
- Não há feedback claro de "salvo com sucesso" (P3/toast — hoje ausente).
- Falta reforçar o valor: o usuário não sabe que essa caixa é o que faz a IA "conhecer" a empresa dele.

### 4.5 O que a M6 entrega aqui

Textarea com placeholder-guia e exemplos, contador amigável, toast de confirmação, e copy que comunica o valor ("Quanto mais você contar, melhor a IA atende seus clientes").

---

## 5. Fase 4 — A primeira conversa real (o inbox)

### 5.1 Contexto

Um lead manda mensagem no WhatsApp. A IA responde sozinha. O operador vê tudo acontecendo pela Dashboard, em tempo real (já implementado). Este é o **coração diário** do produto.

### 5.2 Passos

1. Lead escreve → aparece uma conversa nova na lista.
2. IA responde automaticamente (conversa em modo `bot`).
3. Operador acompanha a timeline se atualizando sozinha (~4s de polling).
4. IA usa o Cérebro da IA para responder com contexto.

### 5.3 Estado emocional

Observando → confiante (a IA está trabalhando por mim). Ou, se a interface for confusa, ansioso ("está respondendo? o que está acontecendo?").

### 5.4 Atrito atual (a corrigir na M6)

- A lista de conversas hoje é uma tabela genérica. O produto **é um inbox** — deveria se parecer com um (padrão Intercom/Slack): prévia da última mensagem, timestamp relativo, status claro, quem está atendendo.
- Falta hierarquia: qual conversa precisa de mim AGORA? (aguardando humano tem que saltar aos olhos — âmbar, selo).
- Estados de loading/vazio/erro na lista e na timeline precisam do contrato de 4 estados (P3).

### 5.5 O que a M6 entrega aqui

Retrofit da tela de Conversas para o **padrão inbox** (maior peso do bloco M6E), com o item "aguardando humano" visualmente prioritário, timeline com estados tratados, e o padrão de tempo real sem "piscar carregando".

---

## 6. Fase 5 — Assumir e responder (o caminho crítico)

### 6.1 Contexto

A IA escala para humano (por decisão dela, por falha, ou por não saber responder — todos já implementados). O operador é **notificado** (badge + som + notificação nativa, já implementado) e precisa assumir e responder — muitas vezes **pelo celular**.

### 6.2 Passos

1. Notificação dispara (conversa entrou na fila "aguardando humano").
2. Operador vê o contador/badge subir na Sidebar.
3. Abre a conversa → vê a linha destacada (âmbar, "Aguardando atendente").
4. Clica em "Assumir conversa" → vira dono.
5. Escreve e envia pela caixa de resposta → mensagem sai pelo WhatsApp.

### 6.3 Estado emocional

Alerta ("preciso responder") → no controle (assumi, estou resolvendo). Qualquer fricção aqui — botão escondido, caixa de resposta ruim no celular — gera frustração num momento sensível (tem um lead esperando).

### 6.4 Atrito atual (a corrigir na M6)

- Este é o **caminho crítico do P7** e precisa ser impecável no **mobile** — hoje a responsividade não foi verificada.
- O botão "Assumir" e a caixa de resposta precisam estar ao alcance imediato, sem caça ao elemento.
- Feedback de "mensagem enviada" precisa ser instantâneo e claro.

### 6.5 O que a M6 entrega aqui

Responsividade real do fluxo assumir→responder (bloco M6G, foco mobile), ações do caminho crítico em destaque, feedback de envio imediato. É o fluxo que **não pode** falhar em nenhum dispositivo.

---

## 7. Fase 6 — Uso diário e gestão

### 7.1 Monitorar (todos os dias)

O operador abre a Dashboard e quer, em segundos, saber: _tem alguém esperando? está tudo conectado? como foi o dia?_ A Dashboard inicial precisa responder isso de relance (hoje não há uma "home" que resuma o estado — é um ponto de melhoria).

### 7.2 Acompanhar resultados (Analytics)

Owner/Admin olham métricas: quantas conversas, uso/custo da IA, fluxo de mensagens (já implementado). Atrito atual: tabelas densas sem hierarquia visual, valores técnicos sem formatação amigável.

### 7.3 Gerir equipe (Owner/Admin)

Convidar/gerenciar usuários, respeitando a hierarquia de cargos (já implementado). Atrito atual: tela funcional mas crua; ações destrutivas (revogar acesso) precisam de confirmação clara (P4.3).

### 7.4 Auditoria (a construir)

O `AuditLog` existe no banco mas **não tem tela** (pendência da M5). A M6 constrói esse viewer já no padrão novo — quem fez o quê e quando, importante para confiança e para o Owner.

### 7.5 Estado emocional do uso diário

Rotina → o produto tem que ser um lugar em que dá gosto (ou pelo menos não dá preguiça) de entrar todo dia. Fricção diária acumula e leva ao churn.

---

## 8. Jornada do lado invisível: o lead final

O lead nunca vê a Dashboard, mas a experiência dele é o produto. A UI do operador existe para que a experiência do lead seja boa:

1. Lead manda mensagem → resposta rápida da IA (com contexto do negócio).
2. Se a IA não sabe → recebe um aviso educado e é encaminhado a um humano (nunca silêncio — já implementado).
3. Humano assume e responde → continuidade sem o lead perceber a troca.
4. Se ninguém assume e ele volta depois → o bot reassume e responde (reativação após 30 min — já implementado).

**Implicação para a UI do operador:** tudo que reduz o tempo entre "lead esperando" e "humano respondendo" é prioridade máxima. É por isso que a notificação, o destaque de "aguardando" e o caminho crítico mobile (Fase 5) são os pontos de maior peso da M6.

---

## 9. Mapa de momentos × prioridade para a M6

| Momento                         | Frequência         | Impacto na confiança        | Prioridade M6     |
| ------------------------------- | ------------------ | --------------------------- | ----------------- |
| Primeiro login                  | 1x por cliente     | Altíssimo (1ª impressão)    | Alta              |
| Conectar WhatsApp (empty state) | 1x por cliente     | Altíssimo (ativação)        | **Máxima**        |
| Ensinar a IA                    | Poucas vezes       | Alto (momento "uau")        | Média-alta        |
| Inbox de conversas              | Diário, o dia todo | Alto (coração do produto)   | **Máxima**        |
| Assumir e responder (mobile)    | Várias vezes/dia   | Altíssimo (caminho crítico) | **Máxima**        |
| Analytics                       | Semanal            | Médio                       | Média             |
| Gestão de usuários              | Raro               | Médio                       | Média             |
| Auditoria                       | Raro               | Médio (confiança)           | Média (tela nova) |

Os três "máxima" — empty state de conexão, inbox, e caminho crítico mobile — são onde o produto ganha ou perde o cliente. É por eles que o retrofit da M6 começa, com um **checkpoint de validação com cliente real** logo após, antes dos blocos de acabamento.

---

## 10. Princípios da jornada (resumo acionável)

1. Todo cliente novo passa por: login → **conectar WhatsApp** → ver a IA funcionar. Otimizar esse funil acima de tudo.
2. O estado vazio de "sem WhatsApp conectado" é a tela mais importante de acertar.
3. O produto é um **inbox** — a tela de conversas deve se parecer com um.
4. O caminho "aguardando → assumir → responder" tem que ser impecável no **celular**.
5. A UI do operador existe para reduzir o tempo de espera do lead final.
6. Nada nesta jornada assume signup automático — ele não existe (ainda) e não é escopo da M6.

---

_Este documento mapeia a jornada real do produto hoje. Quando o produto ganhar novas fases (signup, onboarding, billing), elas entram aqui antes de virar tela._
