# Configurações — Auditoria e Plano de Reestruturação

> **Status:** proposta, aguardando aprovação. Nada implementado.
> **Data:** 2026-08-27
> **Escopo:** aba Configurações (`/sessions/:s/settings` e `/settings`).

---

## 1. Estado atual

Configurações **nunca foi projetada** — foi acumulada. O histórico no código e em
`PROJECT_STATUS.md` mostra a sequência:

1. **M6H-1**: a página de detalhe de uma sessão (`/sessions/:s`) foi renomeada para
   "Configurações". Ou seja: a aba nasceu sendo *a tela de conexão de UM WhatsApp*.
2. **Redesign R2 (2026-08-05)**: viraram abas ali dentro "Equipe", "Auditoria" e "Tags"
   — coisas do **tenant inteiro** metidas dentro da tela de **uma sessão**.
3. **2026-08-15 / 2026-08-26**: "Leads" e "Tags" saíram (viraram módulo próprio /
   migraram para dentro de Conversas).
4. **2026-08-27 (hoje)**: entrou "Perfil" e "Empresa"; a tela subiu para nível tenant.

O resultado é o que você percebeu: **não é uma central de configurações, é uma gaveta
de telas administrativas** que sobraram sem casa própria.

### Achado mais importante da auditoria

> **O produto não tem configuração de empresa. Tem configuração de canal.**

O model `Tenant` no Prisma tem exatamente **dois** campos utilizáveis:

```
model Tenant { id, name, apiKeyHash, createdAt, updatedAt }
```

Não existe timezone, idioma, branding, política de atendimento, retenção — nada.
Enquanto isso, tudo que **é** configuração de verdade está **por sessão de WhatsApp**:

| Configuração real | Onde vive hoje | Escopo real no banco |
|---|---|---|
| Horário de atendimento, timezone, dias úteis | `AiBusinessProfile` | **por sessão** |
| Mensagem fora de horário | `AiBusinessProfile` | por sessão |
| IA ligada/desligada | `AiBusinessProfile.aiEnabled` | por sessão |
| Nível de autonomia da IA, desconto máx., tópicos proibidos | `AiPreferences` | por sessão |
| Mensagem de transferência p/ humano | `AiPreferences` | por sessão |
| Base de conhecimento / FAQ | `AiBusinessProfile`, `AiFaqEntry` | por sessão |

E essas configurações **não estão em Configurações** — estão dentro do **Cérebro da IA**
(`/sessions/:s/ai`, 5 abas: Visão geral, Conhecimento, Guiado, FAQ, Preferências).

**Consequência:** "Horário de atendimento" — que é regra de **atendimento**, não de IA —
está enterrado em *Cérebro da IA → Visão geral*. Um dono de negócio nunca vai procurar
ali.

---

## 2. Inventário 100% da aba atual

Navegação: `SettingsTabs.tsx`, 4 abas, gate por papel. Sem estado na URL (`useState`).

### 2.1 Aba **Perfil** (`ProfileSettingsTab.tsx`)

| Item | Função | API | Permissão | Editável | É config? | Veredito |
|---|---|---|---|---|---|---|
| Avatar + nome | Identidade visual | `GET /api/auth/me` | sessão de pessoa | — | Não (identidade) | **Sai** para Perfil |
| Botão "Editar" | Abre form inline | — | — | — | Não | Sai para Perfil |
| Campo Nome | Nome da pessoa | `PATCH /api/auth/me` | própria conta | Sim | Não (dado pessoal) | Sai para Perfil |
| Campo URL da foto | Foto de perfil | `PATCH /api/auth/me` | própria conta | Sim | Não | Sai para Perfil |
| E-mail (leitura) | Identificação | `/me` (cookie) | — | Não | Não | Sai para Perfil |
| Status da conta | Ativo / senha provisória | `/me` (cookie) | — | Não | Não | Sai para Perfil |
| Cargo · Empresa | Papel + nome do tenant | `/me` + `GET /api/tenant` | — | Não | Não | Sai para Perfil |
| **Segurança** → Trocar senha | 3 campos + submit | `POST /api/auth/change-password` | própria conta | Sim | Não (segurança pessoal) | Sai para Perfil |
| **Segurança** → Sair | Logout | `POST /api/auth/logout` | — | — | Não | Sai para Perfil (já tem atalho no header) |
| **Empresa** → Nome da empresa | Nome do tenant | `GET/PATCH /api/tenant` | `tenant:manage` (só OWNER) | Sim (OWNER) | **Sim** | **Fica** em Configurações › Empresa |
| **Preferências** → Tema escuro | Claro/escuro | `localStorage` (nada no servidor) | — | Sim | Parcial | Sai para Perfil (é por navegador, não por conta) |

### 2.2 Aba **WhatsApps** (`WhatsAppsSettingsTab.tsx`)

Dois modos, decididos por `?session=`:

**Modo lista** (sem `?session=`)

| Item | Função | API | Permissão | Veredito |
|---|---|---|---|---|
| Botão "Conectar WhatsApp" | Abre diálogo de criação | `POST .../whatsapp-sessions` | `session:connect` | Fica |
| Card de sessão (área superior) | Entra na sessão (Dashboard) | — (navegação) | `session:read` | Fica |
| Botão "Gerenciar" | Abre a descrição da sessão | — (navegação) | `session:read` | Fica |
| Badge de aguardando atendimento | Conversas esperando humano | `useWaitingForHuman` | `conversation:read` | **Discutível** — é operação, não config |
| Estado vazio | CTA de primeira conexão | — | — | Fica |

**Modo descrição** (`?session=X`) — `SessionConnectionPanel.tsx`

| Item | Função | API | Permissão | É config? | Veredito |
|---|---|---|---|---|---|
| Foto/nome/número da sessão | Identidade do canal | `GET .../whatsapp-sessions/:s` | `session:read` | Não (estado) | Fica |
| Status + "Conectado desde" + "Última atividade" | Monitoramento | idem | `session:read` | Não (**monitoramento**) | Fica |
| "Geração da instância" / "Criada em" | Metadados técnicos | idem | `session:read` | Não | Fica (menos destaque) |
| Botão **Reconectar** | Reabre conexão | `POST .../connect` | `session:connect` | Não (ação) | Fica |
| Botão **Desconectar** | Encerra sessão | `POST .../disconnect` | `session:disconnect` | Não (ação) | Fica |
| Botão **Remover sessão** | Apaga a sessão | `DELETE .../:s` | `session:remove` | Não (ação **perigosa**) | Fica, em zona de perigo |
| Diálogo de confirmação de remoção | Confirmação | — | — | — | **Já existe** (ok) |
| QR Code + instruções | Parear aparelho | `GET .../qr` (SSE) | `session:connect` | Não | Fica |
| Histórico recente | Eventos da sessão | `GET .../events` | `session:read` | Não (**auditoria de canal**) | Fica |

### 2.3 Aba **Equipe** (`UserManagementPanel.tsx`) — gate: `administrator`/`owner`

| Item | Função | API | Permissão | Veredito |
|---|---|---|---|---|
| Form: e-mail + senha provisória + cargo + "Criar usuário" | Cria membro | `POST .../users` | `user:create` | Fica |
| Tabela (E-mail, Cargo, Status, ações) | Lista membros | `GET .../users` | `user:read` | Fica |
| `select` de cargo por linha | Muda papel | `PATCH .../users/:id/role` | `user:update` | Fica |
| Menu "⋯" → Suspender | Bloqueia acesso | `POST .../users/:id/suspend` | `user:suspend` | Fica — **falta confirmação** |
| Menu "⋯" → Reativar | Restaura acesso | `POST .../users/:id/reactivate` | `user:suspend` | Fica |
| Menu "⋯" → Redefinir senha | Senha provisória | `POST .../users/:id/reset-password` | `user:update` | Fica — **falta confirmação** |
| Mensagens de erro do painel | Feedback | — | — | Fica |

### 2.4 Aba **Auditoria** (`AuditLogPanel.tsx`) — gate: `manager`+

| Item | Função | API | Permissão | Veredito |
|---|---|---|---|---|
| Filtro de ação | Filtra por tipo | `GET .../audit-logs?action=` | `audit:read` | Fica |
| Tabela: Quando/Ação/Usuário/Alvo | Trilha administrativa | idem | `audit:read` | Fica |
| Paginação por cursor | Carrega mais | idem | `audit:read` | Fica |

---

## 3. Problemas encontrados

### P1 — Arquitetural: Perfil e Workspace na mesma barra de abas *(o que você apontou)*

"Perfil" (eu) e "Equipe/Auditoria" (minha empresa) são **escopos diferentes** disputando
a mesma barra. Some a isso o gate por papel: um `operator` vê **2 abas** (Perfil,
WhatsApps), um `owner` vê **4**. A mesma tela muda de forma conforme quem entra — não
parece um lugar, parece um resto.

### P2 — Arquitetural: não existe configuração de empresa

Como mostrado na §1: `Tenant` só tem `name`. A aba "Empresa" tem **exatamente 1 campo**.
Não sustenta uma categoria — e é por isso que ela foi fundida em Perfil na rodada de hoje.
O problema real não é onde colocar o campo; é que **o modelo de dados não tem escopo de
empresa**.

### P3 — Arquitetural: configuração de atendimento está dentro do "Cérebro da IA"

Horário de atendimento, dias úteis, timezone e mensagem de ausência **não são IA** — são
regras de atendimento do canal. Estão em `Cérebro da IA → Visão geral` porque a tabela
que os guarda se chama `AiBusinessProfile`. É um vazamento de nome de tabela para a UX.

### P4 — Barra de abas plana não escala

4 abas hoje; a proposta abaixo prevê 6 áreas. Barra horizontal com gate por papel vira
uma fileira instável. Padrão de mercado para settings hub: **sidebar interna**.

### P5 — Aba não é deep-linkável nem compartilhável

`SettingsTabs` guarda a aba em `useState`. `?tab=` é lido **só na entrada** pelo servidor;
clicar numa aba **não muda a URL**. Não dá para favoritar "Configurações › Equipe", e
F5 volta para Perfil. *(Web Interface Guidelines: "URL reflects state".)*

### P6 — Ações perigosas sem confirmação

| Ação | Reversível? | Confirmação hoje |
|---|---|---|
| Remover sessão | **Não** | Diálogo (ok) |
| Suspender usuário | Sim | **Nenhuma** — 1 clique no menu |
| Redefinir senha de alguém | Não (a senha antiga morre) | **Nenhuma** |
| Desconectar WhatsApp | Sim (mas derruba o atendimento) | Nenhuma |
| Mudar cargo (inclusive rebaixar) | Sim | Nenhuma — o campo aplica direto |

### P7 — Formulários sem estado de "salvo/não salvo"

`CompanySettingsTab` e o form de perfil não avisam sobre alterações não salvas ao sair
(`beforeunload`/guard de rota). O campo de empresa não indica *dirty state*.

### P8 — Achados de acessibilidade (skill `web-design-guidelines`)

```
SettingsTabs.tsx:89         - aba em useState, não na URL (deep-link quebrado)
UserManagementPanel.tsx:364 - campo de cargo dispara mutação no onChange, sem confirmar
UserManagementPanel.tsx:97  - "Suspender" sem confirmação (ação administrativa)
UserManagementPanel.tsx:240 - "Redefinir senha" sem confirmação
AuditLogPanel.tsx:66        - toLocaleString('pt-BR') hardcoded -> usar Intl.DateTimeFormat
AuditLogPanel.tsx:176       - tabela sem caption/aria-describedby
AuditLogPanel.tsx           - lista de 50+ linhas sem virtualização (aceitável hoje)
CompanySettingsTab.tsx      - sem aviso de alterações não salvas
```
**Passa bem:** labels (`sr-only` nos campos de seleção), `aria-label` por linha, foco
visível, `aria-live` nas mensagens, diálogo de remoção de sessão.

---

## 4. Classificação (A–J) do que existe hoje

| Categoria | Itens |
|---|---|
| **A** Config real do sistema | *(vazio — não existe config global de tenant hoje)* |
| **B** Administração do tenant | Nome da empresa |
| **C** Administração de usuários | Criar/suspender/reativar/cargo/reset de senha |
| **D** Gerenciamento de WhatsApp | Conectar, QR, reconectar, desconectar, remover, histórico |
| **E** Segurança | Trocar senha *(pessoal)*, logout |
| **F** Preferências pessoais | Nome, foto, tema |
| **G** Monitoramento | Status da sessão, última atividade, badge de fila |
| **H** Auditoria | Trilha de ações |
| **I** Não deveria estar aqui | **Perfil inteiro** (é "eu", não "minha empresa") |
| **J** Falta, mas deveria existir | Timezone/idioma do tenant, horário global de atendimento, sessões ativas (dispositivos), política de senha, exportação/retenção de dados, webhooks |

---

## 5. Matriz de escopo (multi-tenant)

| Configuração | Usuário | Tenant | WhatsApp | Campanha | IA |
|---|:--:|:--:|:--:|:--:|:--:|
| Nome, foto | X | | | | |
| Senha | X | | | | |
| Tema | X (navegador) | | | | |
| Nome da empresa | | X | | | |
| Timezone / idioma | | **falta** | X (hoje) | | |
| Horário de atendimento | | **falta** | X (hoje) | | |
| Mensagem fora de horário | | | X | | |
| IA ligada/desligada | | | X | | |
| Autonomia / desconto / tópicos | | | X | | X |
| Base de conhecimento / FAQ | | | X | | X |
| Provider de IA, modelo, prompt | | **só `.env`** | | | X |
| Cargos e usuários | | X | | | |
| API key | | X | | | |
| Janela de envio, ritmo | | | | X | |

**Leitura:** a coluna "Tenant" é quase vazia. Toda configuração de negócio hoje é
**por canal**. Isso é uma decisão implícita que nunca foi tomada de propósito — e é a
raiz de "a aba não faz sentido".

---

## 6. Matriz RBAC proposta (usando o RBAC existente, sem inventar)

| Área | read_only | operator | manager | administrator | owner |
|---|:--:|:--:|:--:|:--:|:--:|
| Empresa (ver) | X | X | X | X | X |
| Empresa (editar) | | | | | X `tenant:manage` |
| Atendimento (horário) | ver | ver | ver | editar `ai_profile:update` | X |
| WhatsApps (ver) | X `session:read` | X | X | X | X |
| WhatsApps (conectar/desconectar) | | X | X | X | X |
| WhatsApps (remover) | | | | X `session:remove` | X |
| Equipe | | | | X `user:*` | X |
| Auditoria | | | X `audit:read` | X | X |
| Segurança do workspace | | | | | X |

### Achados de RBAC

**Permissões declaradas e nunca aplicadas** (varredura em todo `apps/api/src`):

| Permissão | Situação |
|---|---|
| `conversation:resume_any` | Usada só para **informar a UI** (`canResumeAny`), nunca como gate |
| `conversation:reassign` | **Zero uso.** Reatribuir conversa não existe no produto |
| `user:manage_admins` | **Zero uso.** Qualquer `administrator` pode criar outro administrator |
| `ownership:transfer` | **Zero uso.** Transferir posse do tenant não existe |

**Risco concreto:** `user:manage_admins` não ser aplicada significa que um
`administrator` pode promover a si mesmo ou a outros — não há barreira entre
"administrador" e "administrador que cria administradores". Vale decidir: aplicar a
permissão ou removê-la do catálogo. **Não recomendo mexer nesta rodada** (é mudança de
RBAC, você pediu para não alterar), mas fica registrado.

---

## 7. Nova arquitetura proposta

### Princípio

**Perfil sai de Configurações.** Vira área própria, acessível pelo avatar/menu de conta.
Configurações passa a ser **exclusivamente workspace**.

### Navegação: sidebar interna (não abas)

```
CONFIGURAÇÕES                     +-----------------------------+
                                  |                             |
  EMPRESA                         |                             |
  - Dados da empresa              |      conteúdo da seção      |
  - Atendimento                   |                             |
                                  |                             |
  CANAIS                          |                             |
  - WhatsApps                     |                             |
                                  |                             |
  PESSOAS                         |                             |
  - Equipe                        |                             |
  - Segurança                     |                             |
                                  |                             |
  REGISTROS                       |                             |
  - Auditoria                     +-----------------------------+
```

Sidebar com **grupos rotulados** resolve P1 e P4: escala sem virar fileira instável, e o
agrupamento comunica escopo (Empresa ≠ Pessoas ≠ Canais). Cada seção vira rota real
(`/settings/empresa`, `/settings/equipe`…) — resolve P5 de graça.

### Categorias

| # | Categoria | Objetivo | Conteúdo | Permissão | Frequência | Prioridade |
|---|---|---|---|---|---|---|
| 1 | **Dados da empresa** | Identidade do workspace | Nome; *(futuro: timezone, idioma, logo)* | ver: todos / editar: `tenant:manage` | Rara | **P0** |
| 2 | **Atendimento** | Regras de atendimento | Horário, dias, timezone, mensagem de ausência — **hoje escondido no Cérebro da IA** | `ai_profile:update` | Média | **P1** |
| 3 | **WhatsApps** | Canais | Lista + conexão/QR/histórico/remoção | `session:*` | Alta | **P0** (já existe) |
| 4 | **Equipe** | Quem trabalha comigo | CRUD de usuários e cargos | `user:*` | Média | **P0** (já existe) |
| 5 | **Segurança** | Controle de acesso do workspace | *(futuro: sessões ativas, política de senha)* | `owner` | Rara | **P2** |
| 6 | **Auditoria** | O que aconteceu | Trilha filtrável | `audit:read` | Rara | **P0** (já existe) |

---

## 8. O que SAI de Configurações

| Item | Vai para | Porquê |
|---|---|---|
| **Perfil inteiro** (conta, senha, sair, tema) | **Área "Perfil"** própria, pelo avatar/menu de conta | É "eu", não "minha empresa" — resolve P1 |
| Badge de fila no card de sessão | Conversas | É operação do dia, não configuração |

**Sobre o tema:** hoje é `localStorage` (por navegador). Vai para Perfil como
*preferência local* — ou vira preferência de conta, o que exigiria campo novo em `User`.
Recomendo manter local por ora.

## 9. O que ENTRA em Configurações

| Prioridade | Item | Custo | Depende de |
|---|---|---|---|
| **P0** | Nova navegação (sidebar + rotas reais por seção) | Médio | Nada |
| **P0** | Confirmação em ações perigosas (suspender, reset de senha, desconectar, mudar cargo) | Baixo | Nada |
| **P1** | **Atendimento** promovido do Cérebro da IA para cá | Médio | Nada no banco — os campos já existem |
| **P1** | Timezone e idioma do tenant | Médio | **Migration** em `Tenant` |
| **P1** | Aviso de alterações não salvas | Baixo | Nada |
| **P2** | Sessões ativas (dispositivos logados, revogar) | Médio | `RefreshToken` já tem `userAgent`/`ip`/`expiresAt`; **faltam endpoints** |
| **P2** | Logo / branding da empresa | Alto | Migration + storage de arquivo |
| **Futuro** | Exportação de dados, retenção, LGPD | Alto | Decisão de produto |
| **Futuro** | Webhooks / integrações | Alto | Não existe nada hoje |
| **Futuro** | Plano, uso, faturamento | Alto | Sem billing no produto |

## 10. O que NÃO deve entrar

| Item | Por quê |
|---|---|
| Cérebro da IA (conhecimento, FAQ, autonomia) | Módulo próprio, por sessão. Só o **horário** sobe — o resto é treinamento de IA |
| Campanhas | Módulo próprio |
| Contatos | Módulo próprio |
| Analytics | Visualização, não configuração |
| Tags e Respostas rápidas | Já migraram para dentro de Conversas, junto do uso — decisão correta, não reverter |
| Provider/modelo/chave de IA | Vive em `.env`. Expor na UI = expor credencial e permitir quebrar o serviço em produção |
| API key do tenant | **Discutível.** Existe (`apiKeyHash`) mas não há UI. Só faria sentido junto de "Integrações" — não isolada |

---

## 11. Hierarquia e ações perigosas

| Classe | Itens | Tratamento |
|---|---|---|
| Muito frequentes | Ver status de WhatsApp | Acesso direto |
| Pouco frequentes | Horário, nome da empresa | Formulário simples com "salvar" |
| Administrativas | Criar usuário, mudar cargo | Confirmação leve |
| **Perigosas** | Remover sessão, suspender usuário, redefinir senha, desconectar | **Diálogo com o nome do alvo e botão destrutivo explícito** |
| Avançadas | *(futuro: retenção, exportação)* | Seção separada, recuada |

Recomendo uma **zona de perigo** visualmente separada (borda destrutiva) no fim das
seções de WhatsApp e Equipe, padrão GitHub/Vercel.

---

## 12. Fases de implementação

| Fase | Entrega | Risco |
|---|---|---|
| **1** | Perfil sai para área própria; Configurações vira sidebar com rotas reais | Baixo — move componentes existentes |
| **2** | Confirmação em ações perigosas + zona de perigo | Baixo — só UI |
| **3** | "Atendimento" promovido do Cérebro da IA | **Médio** — mexe em tela existente e usada |
| **4** | Timezone/idioma do tenant (migration) | Médio — migration aditiva |
| **5** | Sessões ativas (endpoints novos) | Médio |

## 13. Riscos

1. **Fase 3 mexe no Cérebro da IA**, que está em uso. Mover o horário exige manter o
   mesmo endpoint e não quebrar `AiProfilePanel` (que já tem 2 testes falhando —
   pré-existentes, não relacionados).
2. **Rotas reais por seção** invalidam links antigos (`?tab=`) — precisa de redirect,
   como já foi feito nesta semana.
3. **Timezone no tenant** cria ambiguidade com o timezone por sessão que já existe.
   Precisa de regra clara: tenant é o padrão, sessão sobrescreve. Sem isso, vira bug.
4. Já houve **8 rodadas de mudança de navegação hoje**. Recomendo estabilizar e validar
   com uso real antes da Fase 3+.

## 14. Critérios de aceite

- Perfil não aparece em Configurações; é alcançável em até 2 cliques pelo avatar.
- Cada seção tem URL própria, favoritável, sobrevive a F5.
- Nenhuma ação irreversível ou de impacto executa em 1 clique sem confirmação.
- `operator` e `owner` veem a mesma **estrutura** (itens sem permissão ausentes, não
  uma tela de forma diferente).
- Nenhuma configuração duplicada entre Configurações e Cérebro da IA.
- `tsc`/`eslint` limpos; suíte sem regressão (baseline: 2 suítes pré-existentes falhando).
- Validação no navegador com conta real antes de fechar cada fase.

---

## 15. Discordâncias registradas

Você pediu para eu não concordar automaticamente. Três pontos:

1. **"Empresa" não sustenta uma categoria hoje** — 1 campo (`name`). Vale como seção
   P0 apenas se a Fase 4 (timezone/idioma) vier junto; senão é uma tela com um input.
2. **"Integrações" e "API" não devem entrar nem como placeholder.** Não existe webhook,
   integração ou API pública no produto. Uma seção vazia prometendo função inexistente
   é pior que a ausência dela.
3. **A ideia de mover "Auditoria" para área própria (seu item 16) — não recomendo.**
   Auditoria é consultada raramente e é administrativa; área própria no rail principal
   competiria com Conversas/Pipeline (uso diário). Manter como seção de Configurações
   está correto.
