# PRODUCT_PRINCIPLES.md

> **Idioma:** Português (Brasil), conforme política oficial do projeto (`CLAUDE.md`).
> **Status:** Fonte de verdade da experiência do produto. Toda decisão de UI/UX da Milestone 6 (Product Experience) deve poder ser justificada por um princípio deste documento. Quando um princípio for revisado, registrar a mudança e o motivo.
> **Autoria:** Head of Product + UX Designer.
> **Relação com outros docs:** complementa `USER_JOURNEY.md` (o _como_ a jornada acontece), `CLAUDE.md` §9 (Design System — tokens técnicos) e o levantamento da Milestone 6.

---

## 0. Para que serve este documento

Antes de escrever um componente, uma tela ou uma animação, a pergunta é: _"qual princípio isso serve?"_. Se a resposta for "nenhum, só achei bonito", não entra. Estes princípios existem para tornar decisões de experiência **objetivas e defensáveis** — e para impedir que a Milestone 6 vire uma coleção de escolhas estéticas soltas.

O produto é uma plataforma de atendimento e automação de WhatsApp com IA, usada por pequenas e médias empresas. O usuário típico **não é técnico**, está com pressa, e muitas vezes está lidando com um lead real esperando resposta do outro lado. Todos os princípios abaixo derivam dessa realidade.

---

## 1. Princípios fundamentais (a régua de tudo)

### P1 — Confiança antes de beleza

O produto lida com conversas reais de clientes e dados de negócio. A primeira função da interface não é impressionar, é **transmitir que é seguro confiar o WhatsApp da empresa a ela**. Consistência, previsibilidade e ausência de erros visíveis valem mais que qualquer efeito visual. Um produto "sério" acerta os detalhes invisíveis (favicon, título da aba, estados de erro tratados) antes de investir em brilho.

### P2 — Clareza acima de densidade

O usuário não técnico se perde com telas cheias. Preferir sempre menos informação bem hierarquizada a mais informação comprimida. Cada tela deve ter **um** propósito principal óbvio em 3 segundos. Hierarquia se faz por tipografia e espaço, não por bordas pesadas e caixas dentro de caixas.

### P3 — O usuário nunca fica no escuro

Toda ação tem uma reação visível. Todo carregamento é sinalizado. Todo erro é explicado em linguagem humana com um próximo passo. Todo estado vazio diz o que fazer. O usuário nunca deve olhar para a tela e se perguntar "travou? funcionou? e agora?". Este princípio é o mesmo que rege o backend (a IA nunca deixa o cliente em silêncio) — aplicado à interface.

### P4 — Velocidade percebida é uma feature

Um produto que _parece_ rápido é um produto que respeita o tempo do usuário. Skeleton no lugar de spinner, resposta otimista quando seguro, e **nunca** animar transições de página inteira (isso mata a sensação de velocidade). Movimento serve para dar feedback, nunca para "enfeitar a espera".

### P5 — Consistência é uma promessa

O mesmo conceito tem a mesma aparência em todo lugar. Um status "aguardando humano" é o mesmo âmbar na lista, no detalhe e na notificação. Um botão primário é sempre o mesmo botão. Quando o usuário aprende um padrão numa tela, ele deve valer em todas. Inconsistência custa confiança (ver P1).

### P6 — Desenhar para o pior momento, não para o feliz

A tela mais importante de projetar não é a que está cheia de dados — é a conta nova sem nenhuma sessão conectada, a busca sem resultado, a conexão que caiu, a cota da IA que estourou. Esses são os momentos em que o usuário decide se confia no produto. Estados vazios e de erro são cidadãos de primeira classe, não sobras.

### P7 — Respeitar o contexto do operador

Quem usa isso pode estar no celular, no meio de um atendimento, com um lead esperando. A interface tem que funcionar no telefone, ser rápida de escanear com o olho, e colocar a ação mais provável ao alcance imediato. O caminho crítico (ver uma conversa aguardando → assumir → responder) tem que ser curto em qualquer dispositivo.

### P8 — Iterável, não "definitivo"

O produto ainda está em validação com poucos clientes. Nada de marca, copy ou layout deve ser tratado como intocável. Preferir decisões reversíveis e componentizadas, que permitam mudar a percepção do produto sem reescrever telas. "Definitivo" é uma armadilha nesta fase.

---

## 2. Princípios de interface

### 2.1 Hierarquia visual

- Uma ação primária por tela/seção. As demais são secundárias ou terciárias e visualmente subordinadas.
- Hierarquia se constrói com **tamanho, peso e espaço** de tipografia — não com múltiplas cores fortes competindo.
- Paleta quase monocromática (neutros) + a cor primária da marca reservada para o que é acionável ou precisa de atenção. Cor forte demais em tudo = nada se destaca.

### 2.2 Tipografia

- Uma família principal (Inter, já prevista em `CLAUDE.md` §9, ainda não carregada).
- Escala tipográfica limitada e fixa (definida em tokens) — nada de tamanhos "no olho".
- Dados técnicos (IDs, timestamps crus, JIDs, hashes) em fonte monoespaçada, para diferenciar do conteúdo de leitura.

### 2.3 Cor

- Toda cor vem de um **token** do tema. Zero cor "mágica" hardcoded numa classe solta.
- Cores de status têm significado fixo e único no produto inteiro:
  - **Verde** — saudável / conectado / sucesso.
  - **Âmbar** — atenção / aguardando ação humana.
  - **Vermelho** — erro / desconectado / falha.
  - **Neutro/cinza** — inativo / bot / informação.
- Contraste mínimo **AA (4.5:1)** em texto. Cor nunca é o único portador de significado (acompanhar de rótulo ou ícone — daltonismo).

### 2.4 Espaçamento e layout

- Grade de espaçamento baseada em múltiplos consistentes (tokens) — nada de `margin: 13px`.
- Respiro é intencional: densidade alta só onde o usuário compara muitos itens (tabelas de analytics); densidade baixa onde ele lê e decide (detalhe de conversa).
- Largura de leitura controlada — texto longo nunca ocupa a tela toda.

### 2.5 Ícones

- Uma única biblioteca de ícones (lucide-react), estilo consistente.
- Ícone acompanha rótulo quando o significado não é 100% óbvio — ícone sozinho só para ações universais (fechar, buscar, mais opções).
- Ícone é reforço de significado, nunca decoração.

---

## 3. Contrato de estados (obrigatório)

Todo componente que exibe dados vindos da API tem que tratar, explicitamente, **quatro** estados. Isto é regra, não recomendação — e é a diferença mais visível entre "protótipo" e "produto".

| Estado           | O que o usuário vê                                                   | Regra                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Carregando**   | Skeleton com o formato do conteúdo real (não um spinner genérico)    | Só no primeiro carregamento; atualizações em segundo plano (polling) NUNCA piscam "carregando" nem apagam conteúdo já exibido             |
| **Vazio**        | Mensagem amigável + explicação + 1 ação clara (CTA) quando aplicável | Nunca uma tela em branco. O estado vazio ensina o próximo passo                                                                           |
| **Erro**         | Explicação em linguagem humana + botão de tentar de novo             | Nunca um código de erro cru jogado na cara do usuário. Nunca apagar o conteúdo anterior por causa de uma falha transitória de atualização |
| **Com conteúdo** | O dado, hierarquizado                                                | —                                                                                                                                         |

**Estado vazio mais crítico do produto:** conta nova, WhatsApp ainda não conectado. É a primeira tela que todo cliente novo vê. Ela precisa guiar diretamente para "conectar seu WhatsApp", não mostrar uma lista vazia sem contexto.

---

## 4. Feedback e comunicação com o usuário

### 4.1 Toasts (notificações efêmeras)

- Confirmam ações que deram certo ("Conversa assumida", "Perfil salvo") e avisam erros recuperáveis.
- Curtos, uma linha, somem sozinhos. Erros ficam até o usuário fechar.
- Nunca usar toast para informação crítica que exige decisão — isso é modal/tela.

### 4.2 Linguagem

- Tom: claro, direto, humano, em português do Brasil. Sem jargão técnico com o usuário final ("provider_error", "429", "JID" nunca aparecem para ele).
- Erros dizem **o que aconteceu e o que fazer**, não a causa técnica. Ex.: "Não foi possível carregar as conversas. Tentar de novo?" em vez de "500 Internal Server Error".
- Mensagens de sucesso são discretas; mensagens de erro são acionáveis.

### 4.3 Confirmação de ações destrutivas

- Remover sessão, revogar acesso de usuário, qualquer ação irreversível: sempre confirmação explícita, com o nome do que será afetado.
- Ações reversíveis não pedem confirmação (não irritar o usuário à toa).

---

## 5. Movimento e microinterações

- **Framer Motion, com disciplina.** Movimento existe para dar feedback (hover, item entrando na lista, toast aparecendo), nunca para espetáculo.
- **Nunca animar transição de página inteira** — mata a velocidade percebida (P4).
- Durações curtas (percebidas como "instantâneas com suavidade", não como espera).
- Respeitar `prefers-reduced-motion` — usuário que pediu menos movimento recebe menos movimento (acessibilidade).
- Se uma animação não comunica nada, ela não deveria existir.

---

## 6. Responsividade

- **Mobile é caso de uso real, não hipótese.** O operador atende do celular, no meio do dia (P7).
- Todas as telas funcionam em pelo menos: celular (~375px), tablet (~768px), desktop (~1280px).
- O caminho crítico (ver conversa aguardando → assumir → responder) tem que ser confortável no celular.
- Nada de scroll horizontal acidental. Tabelas densas (Analytics) degradam de forma pensada no mobile, não quebram.

---

## 7. Acessibilidade (mínimo AA)

- Contraste de texto ≥ 4.5:1.
- Todo elemento acionável é alcançável e operável por teclado; foco sempre visível.
- Modais e diálogos com foco preso e fechável por teclado (Radix entrega isso — motivo da escolha).
- Significado nunca depende só de cor (P2.3).
- `alt`/`aria-label` no que precisa; hierarquia de headings coerente.
- Acessibilidade não é bloco final "se der tempo" — é critério de aceite (ver `CLAUDE.md` §9, meta antiga nunca auditada).

---

## 8. Confiança e percepção de qualidade (os detalhes que vendem)

Sinais pequenos que, somados, separam "protótipo" de "produto profissional" — e que hoje estão ausentes:

- Favicon e logo próprios (hoje é o ícone genérico do Next.js).
- Título de aba específico por página (hoje inexistente).
- Nenhum "flash" de conteúdo trocando de lugar ao carregar (layout estável).
- Estados de foco e hover consistentes em tudo que é clicável.
- Nenhum dado técnico cru vazando para o usuário.
- Tempo de resposta percebido baixo (P4).

Nenhum desses itens é notado conscientemente quando está certo — mas todos são notados quando estão errados.

---

## 9. Princípios de engenharia da experiência (para não gerar dívida)

- **Primitivos burros, domínio esperto.** Componentes de UI (`components/ui/`) não conhecem regra de negócio; componentes de domínio compõem os primitivos. Separação espelha a Clean Architecture do backend.
- **Zero duplicação visual.** Um conceito, um componente. Os 3 badges de status existentes hoje (`StatusBadge`, `ConversationStatusBadge`, `AiInteractionStatusBadge`) viram um só, parametrizado por variante.
- **Tokens, não valores soltos.** Toda cor, espaço, raio e sombra vem do tema.
- **Sem regressão de comportamento.** Retrofit visual nunca altera lógica; a suíte de testes continua verde.
- **Iterável (P8).** Marca separada de sistema; decisões reversíveis.

---

## 10. Anti-princípios (o que explicitamente NÃO faremos agora)

Registrado para que a ausência seja entendida como decisão consciente, não esquecimento (mesma cultura de ADR do projeto):

- **Dark mode** — dobra o QA de cada componente; fora de escopo da M6.
- **Identidade de marca "definitiva"** — é v1 iterável; posicionamento ainda em validação (P8).
- **Densidade estilo planilha** — o usuário não é analista de dados; clareza > densidade (P2).
- **Animações elaboradas / transições de página** — contra P4.
- **Personalização de tema pelo usuário** — complexidade sem demanda validada.

---

_Este documento é a régua da experiência do produto. Divergências devem ser discutidas e registradas aqui antes de virar código._
