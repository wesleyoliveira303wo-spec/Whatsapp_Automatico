# Contexto do projeto: WhatsApp Automation Platform

Você vai atuar como consultor técnico / Tech Lead para este projeto. Abaixo está o estado completo e atualizado da plataforma — leia tudo antes de responder qualquer pergunta ou sugestão sobre ela.

## 1. O que é o produto

Plataforma de automação inteligente para WhatsApp — não é um simples disparador de mensagens, é um **CRM inteligente com IA**. Objetivo: ajudar pequenas e médias empresas a prospectar, atender e nutrir leads via WhatsApp de forma automatizada, com intervenção humana quando necessário.

Visão de longo prazo: hoje é uma aplicação local rodando para um único operador (o dono do projeto); a visão é evoluir para um **SaaS multi-tenant**, suportando múltiplas empresas, números de WhatsApp e agentes de IA.

Público-alvo: startups, agências de marketing e times de vendas que já usam WhatsApp como canal principal.

## 2. Stack tecnológica

- **Frontend/Dashboard:** Next.js (React) + TypeScript + Tailwind CSS, atuando como **BFF (Backend-for-Frontend)** — o navegador nunca fala direto com a API, só com rotas `pages/api/*` do próprio Next.js, que guardam a API key/tokens em cookie httpOnly.
- **Backend (API):** Node.js 20 + Express + TypeScript + Zod (validação).
- **ORM/Banco:** Prisma + PostgreSQL.
- **Fila/Mensageria:** Redis + BullMQ (jobs de resposta de IA, envio outbound de mensagens).
- **WhatsApp:** Baileys (`@whiskeysockets/baileys`, versão `7.0.0-rc13` — biblioteca não-oficial de WhatsApp Web via WebSocket), não a Cloud API oficial.
- **IA:** dois providers plugáveis via Ports & Adapters — **Google Gemini** (REST/fetch direto, sem SDK, provider ativo hoje por ser gratuito) e **Anthropic Claude** (SDK oficial, reservado para um plano premium futuro).
- **Auth:** JWT (access token curto + refresh token com rotação), scrypt para hash de senha, RBAC fixo em código.
- **Testes:** Jest + ts-jest (760+ testes automatizados).

## 3. Arquitetura

Clean Architecture com bounded contexts por domínio, cada um com suas próprias camadas (`domain/`, `application/`, `infrastructure/`, `presentation/`):

- `services/whatsapp` — conexão, sessões, QR Code, envio/recebimento de mensagens via Baileys.
- `services/conversations` — o CRM propriamente dito: conversas, mensagens, status (bot/human), ownership.
- `services/ai` — geração de respostas automáticas (prompt builder, providers, interações, perfil de negócio).
- `services/auth` — usuários, login, RBAC, auditoria.
- `services/analytics` — métricas e eventos.

Regra de ouro respeitada em todo o código: o Domain nunca conhece frameworks (nem Prisma, nem Baileys, nem BullMQ) — tudo isso fica isolado atrás de "ports" (interfaces) implementados na camada de Infrastructure.

## 4. Funcionalidades implementadas hoje

### 4.1 Conexão WhatsApp

- Conexão via QR Code, sessão persistida (reconecta sozinho).
- Dashboard com painel de gestão de sessões: conectar, ver status, histórico de eventos, em "tempo real" (polling ~2-4s).

### 4.2 Ingestão de mensagens e CRM

- Toda mensagem recebida vira uma `Conversation` (por tenant + sessão + contato) e uma `Message`.
- Cada conversa tem um status: `bot` (IA responde automaticamente) ou `human` (um atendente assumiu, ou está na fila esperando um atendente).

### 4.3 IA Autoresponder

- A IA (Gemini ou Claude, configurável por variável de ambiente `AI_PROVIDER`) responde automaticamente mensagens de conversas em modo `bot`.
- **Base de Conhecimento Nível 1 ("Cérebro da IA"):** cada tenant preenche um texto livre (quem é a empresa, o que vende, preços, horários) numa tela da Dashboard; esse texto é injetado no prompt da IA, sem nunca substituir as regras de segurança/anti-alucinação do prompt base.
- **Auto-escalonamento por marcador:** a IA pode decidir, sozinha, encaminhar para um atendente humano — ela emite um marcador interno invisível ao cliente, o sistema detecta, remove o marcador da mensagem enviada, e move a conversa para a fila de "aguardando humano" (sem dono).
- **Escalonamento em qualquer falha:** se a IA não conseguir gerar uma resposta válida (cota estourada, erro do provider, resposta vazia/reprovada), o cliente recebe uma mensagem educada avisando que será encaminhado, e a conversa vai para a fila de humano — nunca fica em silêncio.
- **Retry automático em erro transitório:** se o Gemini responder com um erro passageiro (503 "sobrecarregado", falha de rede), o sistema tenta de novo automaticamente (1x, com ~2s de espera) antes de desistir. Erros permanentes (cota diária esgotada, modelo inexistente) vão direto para o humano, sem retry.
- **Reativação automática do bot:** se uma conversa ficou na fila de "aguardando humano" e ninguém assumiu, depois de 30 minutos de silêncio o bot volta a responder automaticamente na próxima mensagem do cliente. Conversas que um humano de fato assumiu nunca são reativadas sozinhas.

### 4.4 Atendimento humano pela Dashboard

- O operador pode "assumir" uma conversa (vira dono/`assignedToUserId`) e responder pelo próprio painel — a mensagem sai pelo mesmo WhatsApp conectado.
- **Notificação de espera:** quando uma conversa está "aguardando humano" (escalada mas sem dono), a Dashboard mostra um contador/badge, toca um som e dispara notificação nativa do navegador — sem precisar dar F5.
- **Tempo real:** a tela de conversa e a lista de interações de IA se atualizam sozinhas via polling (a cada poucos segundos), pausando quando a aba está em segundo plano.

### 4.5 Autenticação, multiusuário e RBAC

- Login por e-mail/senha (com troca de senha obrigatória no primeiro acesso), 5 cargos fixos com permissões por rota (RBAC), hierarquia de gestão de usuários (cada cargo só gerencia quem está estritamente abaixo), trilha de auditoria append-only.
- Compatibilidade mantida com o modo antigo de autenticação por API key (usado para integração máquina-a-máquina).

### 4.6 Analytics

- Painel de métricas/eventos na Dashboard (gráficos via Recharts).

## 5. Estado de validação (o que já foi testado de verdade em produção, não só em teste automatizado)

- Conversa real com a IA (Gemini) funcionando ponta a ponta.
- Operador assumindo a conversa e respondendo pela Dashboard — mensagem chegando no WhatsApp do cliente.
- Envio para contatos novos (formato "LID" do WhatsApp) — corrigido um bug de endereçamento que impedia a entrega.
- Corrigido um bloqueio anti-spam do WhatsApp (erro 463) que exigiu atualizar a biblioteca Baileys da v6 para a v7 (release candidate).
- Corrigido: modelo de IA incompatível com contas novas do Google (erro 404) e cota diária minúscula de um modelo errado (erro 429) — hoje fixado em `gemini-3.5-flash`, com ~1.500 requisições grátis por dia.

## 6. Pendências conhecidas (não bloqueantes, registradas para o futuro)

- Viewer de auditoria na interface (hoje só existe no banco).
- CSRF token explícito (hoje mitigado por cookie `SameSite=Lax`).
- Lockout de conta por tentativas de login (hoje mitigado por rate limit por IP).
- Rate limit compartilhado via Redis (hoje é em memória, não escala para múltiplas instâncias).
- Nível 2 da Base de Conhecimento (busca por embeddings/RAG para catálogos grandes) — adiado até haver demanda real.
- Instrumentação de debug temporária ainda presente no código do WhatsApp (logs extras usados para diagnosticar os bugs de entrega), a remover quando tudo estiver 100% estável.
- O plano de disparo de campanhas em massa (CRM Core: listas de leads, agendamento de campanhas) ainda não foi construído — está no backlog, depois de um autoresponder de IA maduro.

## 7. Modelo de negócio pensado

Hoje o custo de IA é zero (Gemini free tier). A ideia para quando houver clientes pagantes: usar o Gemini gratuito como base, e oferecer Claude (pago, melhor qualidade) como diferencial de um plano premium — custo embutido na mensalidade do cliente, não repassado diretamente, mantendo a arquitetura de "provider plugável" já pronta para isso.

---

**Instrução final para você (IA que está lendo isso):** considere este documento como a fonte de verdade do estado atual do projeto. Quando eu fizer perguntas, sugestões ou pedir ajuda técnica a partir daqui, responda levando em conta tudo o que foi descrito acima — arquitetura já decidida, funcionalidades já implementadas e pendências já conhecidas — em vez de sugerir do zero algo que já existe.
