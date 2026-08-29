# Auditoria e Reestruturação — Aba Perfil

> Auditoria apenas. Nada foi implementado. Ver checkpoint no fim da conversa
> para o resumo executivo.

## 1. Estado atual

`/perfil` ([pages/perfil.tsx](apps/dashboard/pages/perfil.tsx)) é uma página própria,
fora de Configurações, desde a Reestruturação de Configurações (2026-08-27). Casca
própria (logo + ThemeToggle, sem rail lateral — perfil é da pessoa, não de uma
sessão de WhatsApp). Renderiza um único componente,
[ProfileSettingsTab.tsx](apps/dashboard/components/ProfileSettingsTab.tsx), com 3
cartões empilhados (não é sidebar, não é tabs — uma coluna única, `max-w-xl`):

1. **Minha conta** — avatar + nome + cargo·empresa (somente leitura) + botão
   Editar (abre form inline: nome + URL da foto) + e-mail/status (somente
   leitura, `<dl>`).
2. **Segurança** — `ChangePasswordForm` (reaproveitado) + botão Sair.
3. **Preferências** — só o `ThemeToggle` (tema claro/escuro).

Testado ao vivo (conta QA temporária, criada e removida ao final): heading
hierarchy correta (h1 página → h2 por seção), loading via Skeleton, mensagens
de sucesso/erro com `role="status"`/`role="alert"`. Em 370px (largura comum
de celular) nome/empresa e e-mail truncam com `…` — comportamento CORRETO
pela guideline de conteúdo (truncar é a prática recomendada), mas fica no
limite: numa tela pequena o e-mail pode ficar irreconhecível até o usuário
focar o campo.

## 2. Inventário completo

| Item | Fonte do dado | Editável aqui? | Onde vive de verdade | Classificação |
|---|---|---|---|---|
| Avatar (foto ou iniciais) | `User.avatarUrl` (Prisma) | Sim (`PATCH /auth/me`) | — | **A** |
| Nome | `User.name` | Sim (`PATCH /auth/me`) | — | **A** |
| Cargo (role) | `User.role` | Não (somente leitura) | RH (`UserManagementService`) | **A** (leitura) |
| Empresa (nome do tenant) | `Tenant.name` via `GET /tenant` | Não (saiu na Fase 4) | Configurações › Dados da empresa | **A** (leitura de contexto) |
| E-mail | `User.email` | Não (não há endpoint de troca de e-mail) | — | **A** (leitura) / **D** (editar é lacuna real) |
| Status ("Ativo"/"Senha provisória pendente") | `User.mustChangePassword` (não `User.status`) | Não | RH suspende via `UserManagementService` | **C** — nome do campo confunde: mistura "senha provisória" com "status da conta"; usuário SUSPENSO nem chega a ver esta tela (sessão inválida), então "Ativo" é sempre verdadeiro quando exibido — informação de baixo valor |
| Trocar senha | `POST /auth/change-password` | Sim | — | **A** |
| Sair | `POST /auth/logout` | Sim | — | **A** |
| Tema claro/escuro | `localStorage` (por navegador, não por conta) | Sim | — | **A** — mas rotulado de forma que sugere ser da CONTA; é do NAVEGADOR |
| Sessões/dispositivos ativos | Existe: `RefreshToken.userAgent/ip/expiresAt` | **Não existe endpoint** que liste ou revogue | — | **E** (futuro; dado já existe, API não) |
| Data de criação da conta | `User.createdAt` — **já retornado por `/auth/me`**, mas o tipo `SessionUserInfo` no dashboard não o declara e a UI não o exibe | — | — | **D** (lacuna trivial: 0 mudança de backend) |
| Último acesso | `User.lastLoginAt` — já no schema e em `/auth/me`, **mas só é gravado em `login()` com senha** (não em registro/refresh) | — | — | **D**, com ressalva: dado incompleto hoje (ver §8) |
| Telefone | Não existe no schema | — | — | **Futuro** (sem justificativa clara ainda — ver §7) |
| Plano/assinatura/limites | Não existe NENHUM model de billing no schema | — | — | **Fora de escopo** — não inventar |
| Notificações (e-mail/push) | Não existe nada no backend | — | — | **Futuro**, sem promessa |
| Idioma / fuso horário pessoal | Não existe | — | — | **Futuro**, só se houver conteúdo real que dependa disso (hoje não há) |
| QR Code / conexão WhatsApp | N/A — não está no Perfil | — | Configurações › WhatsApps | **B** (já não está — confirmado, nada a remover) |
| Auditoria/Equipe/Cérebro | N/A — não está no Perfil | — | Configurações | **B** (já não está — confirmado) |

**Achado de segurança/arquitetura relevante**: `PublicUser` (backend) já é
`Omit<User, 'passwordHash'>` — ou seja, `createdAt`, `lastLoginAt`, `tenantId`
e `status` **já trafegam** na resposta de `GET/PATCH /auth/me` hoje. O
gargalo é 100% de frontend: a interface `SessionUserInfo`
([clientApi.ts:113](apps/dashboard/lib/clientApi.ts:113)) só declara
`id/email/role/mustChangePassword/name/avatarUrl`. Isso é uma cesta de compra
muito barata (Fase 2, P0) — não precisa de migration nem de mudança de API.

## 3. Problemas (auditoria crítica, não só inventário)

1. **"Status: Ativo" é teatro.** Um usuário suspenso nunca renderiza esta
   tela (a sessão já é inválida antes de chegar aqui) — então o campo SEMPRE
   mostra "Ativo" ou "Senha provisória pendente". Não é falso, mas também não
   informa nada que o usuário não soubesse já (ele está logado, óbvio que
   está ativo).
2. **"Preferências" tem 1 item só.** Uma seção inteira (título + descrição +
   card) para um único toggle é estrutura desproporcional ao conteúdo —
   sinal de "seção criada para caber a categoria", não porque o conteúdo
   pedia uma seção própria.
3. **Nada mostra HÁ QUANTO TEMPO a conta existe nem quando foi o último
   acesso**, apesar do dado já existir na resposta da API (§2) — perfil
   profissional de SaaS mostra isso rotineiramente (Linear, Vercel, Stripe
   todos mostram "member since").
4. **Sessões ativas/dispositivos**: dado parcial já existe
   (`RefreshToken.userAgent/ip/expiresAt`), zero API, zero UI. Se o usuário
   perguntar "de onde mais eu estou logado?", a resposta hoje é "não dá pra
   saber nem encerrar" — gap real de segurança percebida, não só de feature.
5. **`avatarUrl` só aceita URL colada** — não há upload de arquivo. Coerente
   com o padrão do projeto (documentado deliberadamente, "sem inventar
   infraestrutura de storage sem pedido explícito"), mas é a lacuna nº 1 que
   qualquer usuário real vai sentir primeiro ("por que eu preciso hospedar
   minha própria foto em algum lugar pra colar o link aqui?").

## 4. O que deve permanecer

- Minha conta: avatar, nome (editável), cargo/empresa (leitura), e-mail
  (leitura), trocar senha, sair.
- Tema (mas replanejado — ver §6).
- A separação Perfil (=eu) vs. Configurações (=empresa) — está correta e
  bem documentada no código; a auditoria a confirma, não a contesta.

## 5. O que deve sair / mudar

- **Rótulo "Status: Ativo"** — baixo valor informativo tal como está. Ou
  remove, ou vira algo que agregue (ex.: fundir com "membro desde" — ver
  Fase 2).
- **Seção "Preferências" isolada para 1 item** — funde com "Minha conta" (o
  tema é tão "sobre mim" quanto meu nome) ou aguarda ter 2º item real antes
  de justificar seção própria (ver §6, decisão de arquitetura visual).

## 6. O que está faltando (por prioridade)

| Campo/recurso | Prioridade | Custo de implementação | Justificativa |
|---|---|---|---|
| "Membro desde" (`createdAt`) | **P0** | Trivial — já vem na API, só declarar no tipo + exibir | Contexto básico de qualquer conta profissional |
| "Último acesso" (`lastLoginAt`) | **P1** | Baixo, MAS precisa antes corrigir a gravação (só grava no login com senha — não em refresh/registro). Sem isso, o campo mentiria por omissão em sessões longas | Só implementar depois de fechar o gap de gravação |
| Editar e-mail | **P2** | Médio — precisa reautenticação/confirmação por e-mail (não existe verificação de e-mail hoje); risco de segurança se malfeito | Comum em SaaS, mas não é grátis — exige desenho próprio (fora desta rodada) |
| Sessões/dispositivos ativos (listar + revogar) | **Futuro** | Alto — precisa endpoint novo (`GET/DELETE /auth/sessions`), o dado bruto já existe | Valor real de segurança percebida; não é gambiarra de UI, é feature de verdade |
| Upload de avatar (arquivo, não URL) | **Futuro** | Alto — precisa infraestrutura de storage (não existe hoje em lugar nenhum do produto) | Correto adiar até haver necessidade de storage de arquivo em outro lugar do produto também (ex.: mídia de campanha), pra não abrir uma infra só pra isto |
| Telefone / bio / cargo customizado / departamento | Não recomendado agora | — | Nenhum consome esse dado hoje no Francis (sem RBAC por departamento, sem assinatura de mensagem) — adicionar seria "campo por achar bonito", exatamente o que a missão pediu pra evitar |
| Notificações, idioma, fuso horário pessoal | Não recomendado agora | — | Zero infraestrutura de notificação existe no backend; idioma é fixo (pt-BR); fuso horário pessoal não tem nenhum recurso que dependa dele hoje |
| Plano/assinatura | Fora de escopo do Perfil | — | Não existe billing no produto. Se um dia existir, pertence a Configurações (é dado do TENANT, não da pessoa) — Perfil no máximo linka pra lá |

## 7. Segurança

**O que já existe e está correto:**
- `PATCH /auth/me` nunca aceita `email`/`role`/`status` — só `name`/`avatarUrl`
  (Zod schema recusa qualquer outro campo).
- `userId` vem exclusivamente do JWT verificado (`authUser.userId`), nunca de
  parâmetro de URL — não há como um usuário editar outro via este endpoint
  (confirmado lendo `AuthService.updateProfile`/`getMe`).
- `requireUser` middleware confere `tenantId` do crachá contra o da URL
  quando presente — 403 em divergência (IDOR bloqueado).
- Troca de senha exige senha atual + revoga TODOS os refresh tokens ao
  suceder (sessões antigas morrem).

**O que falta, sem inventar solução:**
- Sem verificação de e-mail (trocar e-mail com segurança precisaria disso).
- Sem endpoint de sessões/dispositivos (§6).
- `User.status` (ACTIVE/SUSPENDED) existe no schema mas não aparece em
  lugar nenhum do Perfil — coerente, já que suspenso nunca chega aqui.

## 8. Preferências — pessoal vs. workspace

| Preferência | Onde vive hoje | Correto? |
|---|---|---|
| Tema claro/escuro | `localStorage`, por NAVEGADOR (não por conta) | Rotulagem atual ("Preferências... neste Dashboard") já deixa isso claro — correto, mas vale reforçar visualmente que é "neste navegador", não "sua preferência salva" |
| Horário de atendimento | Tenant/Sessão (Configurações › Atendimento) | Correto — não é pessoal, é da empresa |
| Idioma da interface | Não existe (fixo pt-BR) | N/A |

## 9. Sessões e dispositivos

Confirmado no schema: `RefreshToken { userAgent, ip, expiresAt, revokedAt,
createdAt }` por usuário — o dado bruto para uma tela de "dispositivos
conectados" já é coletado. **Não existe hoje** nenhum endpoint que liste ou
revogue individualmente (só troca de senha revoga TODOS de uma vez). Não
inventar a tela sem a API — registrado como item de Futuro (§6), não como
Fase desta rodada.

## 10. RBAC

Perfil não depende de nenhuma permissão além de "estar autenticado como
pessoa" (`session.user` existe). Qualquer cargo — owner, administrator,
manager, operator, read_only — edita seu PRÓPRIO nome/foto/senha
igualmente. Correto: identidade pessoal não é hierárquica. `canManageCompany`
(prop legada, marcada `@deprecated` no componente) não tem mais uso — pode
ser removida quando não houver mais chamador (item de limpeza, não desta
fase).

## 11. Multi-tenant

Confirmado por leitura de código (não just inferido): `userId` vem do JWT,
nunca de path/query; `requireUser` rejeita tenant divergente na URL com 403.
Não há caminho para acessar/editar perfil de outro tenant através destes
endpoints.

## 12. UX — conceitos extraídos (não copiados visualmente)

- **Linear/Vercel**: seção "conta" concentra identidade + segurança bem
  próximas, sem fragmentar em muitas sub-telas para poucos campos — bate com
  a decisão de manter poucas seções aqui.
- **Stripe/Slack**: "membro desde" e atividade recente aparecem como
  contexto de confiança, não como funcionalidade — reforça §6 P0.
- Princípio adotado: **não multiplicar seções para parecer "completo"** — é
  exatamente o erro oposto ao que a missão pediu para evitar (campos
  cosméticos). Melhor 2 seções bem povoadas que 4 seções esparsas.

## 13. Arquitetura visual — decisão

Volume real de conteúdo hoje: ~7 campos/ações no total. Nem justifica uma
sidebar interna (Opção B), nem cards navegáveis (Opção C) — isso fragmentaria
uma tela já pequena em múltiplos cliques. **Recomendação: manter Opção A
(página única)**, mas reagrupada:

- **Minha conta** (identidade): avatar, nome, e-mail, cargo/empresa, membro
  desde — e o tema junto aqui (é tão "sobre mim" quanto o resto).
- **Segurança**: senha, sair — e no futuro, sessões ativas.

Duas seções, não três. "Preferências" de item único deixa de existir como
seção própria; quando houver um 2º item de preferência pessoal real, aí sim
justifica separar de novo.

## 14. Roadmap proposto (5 fases)

**Fase 1 — Correção de dado existente (pré-requisito)**
Objetivo: parar de fingir que `lastLoginAt` está confiável.
Corrigir gravação de `lastLoginAt` também no fluxo sem senha (refresh
silencioso não precisa, mas login por registro/token deveria contar como
acesso). Sem isso, Fase 2 exibiria um dado errado.
Risco: baixo. Dependência: nenhuma.

**Fase 2 — "Membro desde" + fusão de Preferências em Minha conta**
Objetivo: fechar a lacuna P0 mais barata e simplificar a arquitetura visual.
Declarar `createdAt`/`lastLoginAt` no tipo `SessionUserInfo`, exibir "Membro
desde [data]" e "Último acesso [data]" na seção Minha conta; mover o
`ThemeToggle` para dentro de Minha conta; remover a seção Preferências.
Risco: baixo. Dependência: Fase 1 (senão `lastLoginAt` mentiria).

**Fase 3 — Repensar o campo "Status"**
Objetivo: parar de mostrar informação de valor zero.
Substituir "Status: Ativo" por algo que já não seja óbvio — ex.: remover a
linha, ou (se aprovado) fundir com "membro desde"/"último acesso" num único
bloco de metadados da conta.
Risco: baixo. Dependência: Fase 2.

**Fase 4 — Fallback de avatar quebrado**
Objetivo: um `avatarUrl` inválido não deve quebrar visualmente.
Adicionar `onError` no `<img>` de `UserAvatar.tsx` caindo para iniciais.
Risco: baixo, puramente defensivo. Dependência: nenhuma.

**Fase 5 — Sessões/dispositivos ativos (maior, avaliar separadamente)**
Objetivo: fechar o gap de segurança percebida mais real do Perfil.
Precisa: endpoint `GET /auth/sessions` (lista `RefreshToken` do próprio
usuário) + `DELETE /auth/sessions/:id` (revoga um). UI nova, dentro de
Segurança. Maior que as fases anteriores — recomendo tratar como projeto à
parte, não dentro deste ciclo de "auditoria de Perfil".
Risco: médio (superfície de API nova). Dependência: nenhuma das anteriores.

## 15. Critérios de aceite (por fase)

- **Fase 1**: `lastLoginAt` é atualizado em todo fluxo de autenticação que
  conta como "acesso"; teste automatizado cobrindo o caso que hoje falta.
- **Fase 2**: "Membro desde" e "Último acesso" visíveis e corretos (validado
  com conta real); Preferências não existe mais como seção própria; tema
  continua funcionando idêntico de dentro de Minha conta; testes
  atualizados; `tsc`/lint limpos.
- **Fase 3**: decisão registrada (manter/remover/fundir "Status") com
  justificativa; sem regressão visual.
- **Fase 4**: URL de avatar inválida renderiza iniciais, não ícone quebrado;
  teste cobrindo o `onError`.
- **Fase 5**: usuário lista suas sessões com dispositivo/IP/data; revoga uma
  sem precisar trocar a senha; sessão atual nunca aparece revogável por
  engano; testes de RBAC/multi-tenant (só vê as PRÓPRIAS sessões).

## 16. Skills/MCPs utilizados

- **web-design-guidelines** — rodada contra `ProfileSettingsTab.tsx`,
  `perfil.tsx`, `ChangePasswordForm.tsx`, `UserAvatar.tsx`. Achados reais:
  placeholder sem reticências, falta de aviso de navegação com edição não
  salva, `<img>` de avatar sem `onError`/dimensões explícitas.
- **Browser (preview/computer/read_page)** — conta QA temporária criada,
  usada para inspecionar a tela em 370px e 1280px, ler a árvore de
  acessibilidade (heading hierarchy, aria-live, `role`), e confirmar
  truncamento visual — depois removida do banco.
- Leitura direta de código (Prisma schema, `AuthService`, `authRouter`,
  `requireUser`, `clientApi.ts`) para confirmar cada afirmação de dado/API —
  nada neste documento é suposição sobre o backend.

## 17. Recomendação

Implementar nesta ordem: **Fase 1 → Fase 2 → Fase 4 → Fase 3**, todas de
risco baixo e ganho imediato de completude percebida sem tocar em schema
novo nem em RBAC. **Fase 5 (sessões/dispositivos)** é a única que julgo
merecer tratamento como projeto separado — tem API nova de verdade e mais
superfície de teste (RBAC + multi-tenant), então não misturaria no mesmo
lote das Fases 1-4.
