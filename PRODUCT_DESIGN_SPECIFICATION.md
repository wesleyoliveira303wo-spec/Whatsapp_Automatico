# Francis — Product Design Specification

> **Para:** Claude Design
> **De:** time de engenharia do Francis
> **Data:** 2026-08-06
> **Objetivo:** permitir que você redesenhe 100% da interface do Francis **sem ler uma linha de código**, preservando integralmente as funcionalidades existentes.

---

## Como ler este documento

Você **não conhece este projeto**. Este documento descreve tudo: o que o produto é, quem usa, cada tela, cada estado, cada componente e cada regra.

Junto com este documento vai **um print de referência visual** (um mockup gerado pelo fundador em outra ferramenta, retratando exatamente este produto na tela de Conversas). O print é a **principal referência de linguagem visual**, mas **não é para ser copiado pixel a pixel** — leia a seção 10 para entender exatamente o que extrair dele.

Regra de ouro: **nada de funcionalidade pode ser perdido**. Tudo o mais (cor, tipografia, espaçamento, ícones, formatos, organização visual) está aberto.

---

## 1. Visão geral do produto

### O que é o Francis

**Francis** é uma plataforma de **atendimento e CRM para WhatsApp com inteligência artificial**. Ele conecta o(s) número(s) de WhatsApp de uma empresa e passa a:

1. **Responder automaticamente** os clientes usando IA, treinada com as informações daquele negócio específico (preços, horários, endereço, serviços);
2. **Pedir ajuda humana** quando não sabe responder — sem nunca deixar o cliente no vácuo;
3. **Permitir que uma pessoa assuma a conversa** e responda pela própria Dashboard, com texto, imagens, áudios, vídeos e documentos;
4. **Classificar cada conversa num funil de vendas** (Novo → Contatado → Negociando → Fechado/Perdido), automaticamente, pela IA;
5. **Medir a operação** (custo de IA, volume de mensagens, taxa de escalonamento, funil, estabilidade da conexão).

Tagline oficial: **"Seu melhor atendente, no automático."**
Personalidade da marca: **prestativo, direto e transparente**.

### Quem utiliza

Pequenas e médias empresas brasileiras que já usam o WhatsApp como canal principal de vendas e atendimento: salões, clínicas, lojas, prestadores de serviço, imobiliárias, franquias.

Dentro de cada empresa, há **cinco cargos** (o sistema é multiusuário e multiempresa):

| Cargo           | Rótulo na UI        | O que faz                                                                                                                                                             |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner`         | **Dono**            | Tudo. Não pode ser rebaixado nem suspenso.                                                                                                                            |
| `administrator` | **Administrador**   | Tudo do gerente + gerenciar usuários, configurar a IA, gerenciar respostas rápidas e o catálogo de tags, remover conexões.                                            |
| `manager`       | **Gerente**         | Tudo do operador + assumir/devolver qualquer conversa (não só as próprias) + ler a trilha de auditoria.                                                               |
| `operator`      | **Operador**        | O atendente do dia a dia: ler conversas, assumir, responder, enviar mídia, mover cards do Pipeline, atribuir tags, gerar resumo da IA, conectar/desconectar WhatsApp. |
| `read_only`     | **Somente leitura** | Só olha: conversas, sessões, analytics e interações de IA. Não envia nada, não move nada.                                                                             |

**Consequência de design importante:** a interface esconde (por cortesia de UX) os destinos que o cargo não pode usar — mas a barreira real é sempre o servidor. Um operador simplesmente **não vê** os ícones de Analytics e IA no menu.

### Objetivo do sistema

Fazer com que **nenhum cliente fique sem resposta**, e que o time humano só entre quando de fato agrega — mantendo, ao mesmo tempo, uma visão comercial (funil) de tudo que está acontecendo.

### Fluxo principal (macro)

```
Cliente manda mensagem no WhatsApp da empresa
        ↓
Francis recebe, guarda a conversa e a mensagem
        ↓
IA lê o histórico + o "Cérebro da IA" (contexto do negócio)
        ↓
IA responde o cliente automaticamente
        ↓
IA classifica a conversa no funil (Novo/Contatado/Negociando/Fechado/Perdido)
        ↓
Se a IA não souber responder OU o cliente pedir um humano:
        → a IA avisa o cliente que vai encaminhar
        → sinaliza "aguardando atendente" na Dashboard (alerta sonoro + notificação + contador)
        → E CONTINUA RESPONDENDO enquanto ninguém assume
        ↓
Operador vê o alerta, abre a conversa, lê o histórico (ou o resumo gerado pela IA)
        ↓
Operador clica "Assumir conversa" → a IA para de responder
        ↓
Operador responde por texto/mídia, usando respostas rápidas se quiser
        ↓
Operador clica "Devolver ao bot" → a IA volta a responder
```

---

## 2. Arquitetura da Dashboard

A Dashboard tem **dois níveis de navegação**. Isso é estrutural e deve ser preservado.

### Nível 1 — Workspace (`/`)

A primeira tela depois do login. **Única função: escolher qual WhatsApp administrar.**

Deliberadamente **não tem menu lateral nenhum**. Nada de Conversas, Analytics, Equipe aqui — tudo isso vive _dentro_ de cada WhatsApp.

Áreas:

| Área                        | Função                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Barra superior (Header)** | Marca (wordmark Francis, clicável → volta ao Workspace), identificação do usuário logado (`e-mail · Cargo`), link "Trocar senha", botão "Sair", alternador de tema claro/escuro. Presente em **todas** as telas. |
| **Cabeçalho da página**     | Título "Seus WhatsApps" + subtítulo "Conecte e gerencie os números que o Francis atende." + botão primário "Conectar WhatsApp".                                                                                  |
| **Grade de cards de conta** | Um card por número de WhatsApp conectado. Grade responsiva: 1 coluna no mobile, 2 em `sm`, 3 em `xl`.                                                                                                            |
| **Estado vazio**            | Quando não há nenhum WhatsApp: ilustração/ícone + "Conecte seu primeiro WhatsApp" + "Escaneie um QR Code para o Francis começar a atender seus clientes automaticamente." + botão de ação.                       |

**Card de conta de WhatsApp** contém: avatar quadrado-arredondado tingido pelo status (verde=conectado, âmbar=conectando, cinza=desconectado) com ícone de celular; ponto de status + nome da conexão; número de telefone (ou "Número ainda não vinculado"); selo textual de status; **badge vermelho com o número de conversas aguardando atendimento humano naquela sessão** (só aparece se > 0); rodapé com "Última atividade: …" e um "Gerenciar ›" que aparece no hover.

### Nível 2 — Dentro de um WhatsApp (`/sessions/:nome/...`)

Aqui vive todo o trabalho. Layout: **rail vertical de ícones à esquerda + área de conteúdo**.

| Área                               | Função                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| **Rail lateral (w-14, só ícones)** | Navegação primária da sessão. Ver detalhamento abaixo.                          |
| **Barra superior (Header)**        | O mesmo Header global do nível 1.                                               |
| **Área de conteúdo**               | Renderiza a tela ativa (Conversas / Pipeline / Analytics / IA / Configurações). |

**Composição do rail, de cima para baixo:**

1. **Botão "voltar"** (seta ←) → volta ao Workspace. Tooltip: "Todos os WhatsApps".
2. **Marca da sessão**: logo do Francis num quadrado com fundo primário sutil, com um **ponto de status da conexão** (verde/âmbar/cinza) sobreposto no canto inferior direito. Tooltip mostra `nome · status`.
3. **Navegação (4 itens)** — todos são ícone + `title`/`aria-label` (sem rótulo escrito):
   - **Conversas** — visível a todos. **Recebe um ponto vermelho sobreposto** quando existem conversas aguardando atendimento humano naquela sessão.
   - **Pipeline** — visível a todos.
   - **Analytics** — só administrador/dono.
   - **IA** — só administrador/dono.
4. **Rodapé: Configurações** — ícone de engrenagem, visível a todos (as abas internas é que têm gates próprios).

O item ativo é destacado com fundo primário sutil + ícone na cor primária. Os inativos são cinza (`muted-foreground`) e ganham fundo neutro no hover.

### As áreas dentro da tela de Conversas (a tela mais importante do produto)

Layout de **três colunas**:

```
┌──┬─────────────┬──────────────────────────┬─────────────────┐
│  │             │                          │                 │
│R │  LISTA DE   │      CONVERSA ABERTA     │    PAINEL DE    │
│A │  CONVERSAS  │                          │    CONTEXTO     │
│I │  (w-80)     │      (flex-1)            │    (w-80)       │
│L │             │                          │                 │
│  │             │                          │                 │
└──┴─────────────┴──────────────────────────┴─────────────────┘
   ↑ w-14
```

**Comportamento responsivo (obrigatório manter):**

- **< `lg` (1024px)**: mostra **ou** a lista **ou** a conversa aberta — nunca as duas. Ao abrir uma conversa, a lista some e aparece um botão "voltar" (seta ←) no cabeçalho do chat.
- **`lg` (1024–1279px)**: lista + conversa lado a lado. O painel de contexto **não aparece**.
- **`xl` (1280px+)**: as três colunas. É o layout do print de referência.

#### Coluna 1 — Lista de conversas

| Sub-área              | Conteúdo                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Barra de busca**    | Campo com ícone de lupa à esquerda. Placeholder: "Buscar pessoa, número ou mensagem". Busca no **nome do contato**, no **número** e na **prévia da última mensagem**, apenas sobre o que já foi carregado. |
| **Barra de filtros**  | 5 pílulas: **Todas · Não lidas · Aguardando · IA · Humano**. A ativa fica com fundo primário e texto claro; as demais são texto cinza com hover neutro.                                                    |
| **Avisos de conexão** | Linha discreta "Reconectando ao servidor…" (âmbar) quando a conexão em tempo real cai; linha vermelha para erros.                                                                                          |
| **Lista**             | Sequência de itens de conversa, roláveis.                                                                                                                                                                  |
| **Rodapé da lista**   | Botão "Carregar mais" (paginação). Some quando há busca ativa.                                                                                                                                             |
| **Estados**           | Carregando (3 esqueletos de linha) · Vazio (com textos diferentes para "sem conversas", "sem resultado de busca" e "sem conversas neste filtro").                                                          |

#### Coluna 2 — Conversa aberta

| Sub-área                  | Conteúdo                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cabeçalho**             | Botão voltar (só em telas estreitas), foto do contato, nome (ou número), linha secundária "Sessão: `nome`", selo de status da conversa, botão "Atualizar".                                                             |
| **Barra de ações**        | Botão primário **"Assumir conversa"** (quando a IA está respondendo) **ou** "Devolver ao bot" (quando um humano assumiu). Se a conversa está marcada como "Não cliente", exibe um indicador só-leitura "IA desligada". |
| **Timeline de mensagens** | Área rolável. Bolhas de mensagem + divisores de data.                                                                                                                                                                  |
| **Botão flutuante**       | "↓ Ir para mensagens recentes" — aparece **só** quando o operador rolou para cima no histórico. Canto inferior direito da timeline.                                                                                    |
| **Composer**              | A caixa de resposta. **Só aparece quando a conversa está sob atendimento humano.** Caso contrário, mostra uma frase explicativa no lugar.                                                                              |

#### Coluna 3 — Painel de contexto do contato

Da esquerda para a direita, de cima para baixo:

1. **Identidade**: foto grande e centralizada, nome em destaque, telefone formatado (`+55 11 98122-4471`).
2. **Chips de estado**: "Aguardando atendente" (âmbar) e/ou o estágio do funil, e/ou "Não cliente".
3. **"Cliente há X"** — tempo de relacionamento derivado da data de criação da conversa (ex.: "Cliente há 2 meses").
4. **Tags** — chips coloridos das tags atribuídas, cada um com um "×" para remover, mais um botão "+ Tag" que abre um seletor com o catálogo da sessão.
5. **Resumo da IA** — parágrafo gerado sob demanda + timestamp ("Gerado há 2h") + selo "Desatualizado" quando chegaram mensagens novas depois da geração + botão "Gerar resumo" / "Atualizar resumo".
6. **Últimas interações** — bloco recolhível listando as últimas 5 chamadas de IA (modelo, tokens, custo, latência, status).

### Outras áreas do produto

| Área                        | Onde vive                   | Função                                                                   |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| **Pipeline (board Kanban)** | `/sessions/:nome/pipeline`  | Funil de vendas visual, com colunas e cards arrastáveis.                 |
| **Analytics**               | `/sessions/:nome/analytics` | Métricas da operação: cards de resumo + 6 gráficos.                      |
| **IA**                      | `/sessions/:nome/ai`        | Duas abas: "Cérebro da IA" e "Respostas Rápidas".                        |
| **Configurações**           | `/sessions/:nome/settings`  | Quatro abas: "Conexão", "Equipe", "Auditoria", "Tags".                   |
| **Login**                   | `/login`                    | Tela dividida: peça visual/comercial de um lado, formulário do outro.    |
| **Trocar senha**            | `/change-password`          | Formulário simples; obrigatório no primeiro acesso com senha provisória. |

---

## 3. Fluxo do operador

### 3.1 Fluxo diário completo (o caminho principal)

```
Operador abre o Francis
        ↓
[LOGIN] Empresa + e-mail + senha
        ↓
[WORKSPACE] Vê a grade de WhatsApps conectados
   → cada card mostra status e um badge vermelho se há gente esperando
        ↓
Clica no card do WhatsApp que vai atender
        ↓
[SESSÃO] Cai direto na tela de Conversas
   → o rail mostra um ponto vermelho sobre "Conversas" se há fila
        ↓
Filtra por "Aguardando" para ver quem precisa de humano
        ↓
Clica numa conversa da lista
   → o chat abre na coluna do meio, já rolado até a última mensagem
   → o contador de não lidas daquela conversa zera automaticamente
   → o painel de contexto aparece à direita
        ↓
Lê o histórico (ou clica em "Gerar resumo" para a IA resumir a situação)
        ↓
Clica em "ASSUMIR CONVERSA"
   → a IA para de responder imediatamente
   → o selo muda para "Atendimento humano"
   → o composer aparece na parte de baixo
        ↓
Responde:
   → digita texto (Enter envia, Shift+Enter quebra linha)
   → ou clica no ícone de respostas rápidas e insere uma frase pronta
   → ou clica no clipe e anexa imagem/áudio/vídeo/documento (+ legenda opcional)
        ↓
Enquanto conversa, organiza:
   → atribui tags no painel de contexto ("Urgente", "VIP", "Orçamento enviado")
        ↓
Resolvido o assunto, clica em "DEVOLVER AO BOT"
   → a IA volta a responder essa conversa
        ↓
Vai para o PIPELINE ver o funil
   → arrasta o card para "Negociando" ou "Fechado" se a IA classificou errado
   → ou arrasta para "Não cliente" se era um amigo/fornecedor, não um lead
        ↓
Fim do dia: abre ANALYTICS para ver volume, custo de IA e taxa de escalonamento
```

### 3.2 Fluxo do administrador (configuração inicial)

```
Administrador entra pela primeira vez
        ↓
[WORKSPACE] "Conectar WhatsApp" → dá um nome à conexão
        ↓
[CONFIGURAÇÕES › Conexão] Aparece um QR Code
        ↓
Abre o WhatsApp no celular → Aparelhos conectados → escaneia
        ↓
Status vira "Conectado" em tempo real
        ↓
[IA › Cérebro da IA] Ensina a IA sobre o negócio:
   → modo "Assistente Guiado" (8 perguntas, uma por tela) OU
   → modo "Texto livre" (uma caixa de texto grande)
   → configura horário de atendimento (dias, horários, fuso, mensagem fora do horário)
        ↓
[IA › Respostas Rápidas] Cadastra frases prontas para os atendentes
        ↓
[CONFIGURAÇÕES › Tags] Cria o catálogo de tags (nome + cor da paleta de 8)
        ↓
[CONFIGURAÇÕES › Equipe] Cadastra os atendentes, define cargos
   → cada um recebe uma senha provisória e troca no primeiro acesso
        ↓
Pronto — a IA já está atendendo.
```

### 3.3 Fluxo do alerta (o que faz o operador largar tudo e vir)

```
IA está conversando com um cliente
        ↓
Cliente pergunta algo que a IA não sabe ("posso parcelar em 12x?")
        ↓
IA responde ao cliente avisando que vai encaminhar
        ↓
Sistema marca a conversa como "aguardando atendente"
   ⚠ IMPORTANTE: a IA NÃO para de responder. Ela continua atendendo
     enquanto ninguém assume — só um clique humano em "Assumir conversa"
     a tira do circuito.
        ↓
Na Dashboard, INSTANTANEAMENTE (polling a cada ~5s):
   → toca um som
   → dispara uma notificação nativa do navegador
   → o contador ao lado de "Conversas" sobe
   → o ícone de Conversas no rail ganha um ponto vermelho
   → o card daquele WhatsApp no Workspace ganha um badge vermelho
   → a linha da conversa na lista fica destacada em âmbar
   → o selo da conversa vira "Aguardando atendente"
        ↓
Operador clica → assume → responde
        ↓
Todos os alertas somem.
```

---

## 4. Lista completa de funcionalidades

Esta é a lista exaustiva do que existe hoje. **Nada aqui pode desaparecer no redesign.**

### 4.1 Autenticação e conta

- Login por **empresa + e-mail + senha**
- Login alternativo por **chave de API** (recolhido atrás de "Outras formas de acesso")
- Logout
- Troca de senha voluntária
- **Troca de senha obrigatória** no primeiro acesso (senha provisória)
- Identificação do usuário logado no cabeçalho (`e-mail · Cargo`)
- Sessão em cookie seguro; renovação automática de token
- Limite de tentativas de login (proteção contra força bruta)

### 4.2 Conexões de WhatsApp

- Listar todos os WhatsApps conectados da empresa (grade de cards)
- **Conectar** um novo WhatsApp (dar um nome + escanear QR Code)
- **QR Code** renderizado na tela, com passo a passo numerado ao lado
- **Desconectar** uma sessão
- **Remover** uma sessão (com diálogo de confirmação)
- **Status em tempo real**: Conectado / Conectando… / Desconectado
- **Ponto de status** (verde/âmbar/cinza) no rail, nos cards e nos cabeçalhos
- Número de telefone vinculado
- Metadados: geração da instância, conectado desde, última atividade, criada em
- **Histórico de conexão** (lista das transições de status recentes)
- Reconexão automática e resiliente

### 4.3 Conversas

- Lista paginada de conversas por sessão, ordenada por atividade mais recente
- **Atualização em tempo real** (a lista e o chat se atualizam sozinhos, sem F5)
- **Busca** por nome do contato, número ou trecho da última mensagem
- **5 filtros**: Todas · Não lidas · Aguardando · IA · Humano
- **Foto de perfil real do WhatsApp** (com fallback: iniciais do nome ou 2 últimos dígitos do número)
- **Nome de exibição do WhatsApp** (pushName) quando disponível
- **Prévia da última mensagem** na lista
- **Contador de mensagens não lidas** (badge numérico verde)
- **Zeragem automática** do contador ao abrir a conversa
- **Timestamp inteligente** (hora se for hoje, dia/mês se for antes)
- **Divisores de data** na timeline ("Hoje" / "Ontem" / data curta)
- **Auto-scroll** para a última mensagem ao abrir a conversa
- **Botão "Ir para mensagens recentes"** quando o operador está lendo o histórico
- **Não arrancar o scroll** do operador quando chega mensagem nova e ele está lendo o histórico
- "Carregar mais" (paginação)

### 4.4 Mensagens

- Bolhas: recebidas à esquerda, enviadas à direita
- **Texto** com quebras de linha preservadas
- **Imagem** (renderizada inline)
- **Áudio** (player nativo)
- **Vídeo** (player nativo)
- **Documento** (card clicável com nome do arquivo e ícone de download)
- **Figurinha** (renderizada como imagem)
- **Legenda** de mídia preservada e exibida abaixo do anexo
- **Selo "Gerada por IA"** + nome do modelo nas mensagens que a IA escreveu
- **Um check ✓** ("enviado") nas mensagens enviadas — _nunca_ dois checks azuis (o produto não sabe se foi lido)
- Horário de cada mensagem
- Mensagens enviadas pelo operador **de outro dispositivo** (celular/WhatsApp Web) também aparecem aqui

### 4.5 Atendimento humano

- **Assumir conversa** (a IA para de responder)
- **Devolver ao bot** (a IA volta a responder)
- **Enviar texto** pela Dashboard
- **Enviar mídia**: imagem, áudio, vídeo, documento (até 16MB)
- **Legenda opcional** junto com a mídia
- **Prévia do anexo** antes de enviar, com botão de remover
- **Enter envia · Shift+Enter quebra linha**
- **Respostas rápidas**: dropdown com frases prontas da sessão; clicar insere no campo
- Confirmação por _toast_ de "Mensagem enviada" / "Arquivo enviado"
- Mensagens de erro claras (WhatsApp desconectado, arquivo grande demais, conversa assumida por outra pessoa, cargo sem permissão)
- **Regra de posse**: um operador só devolve ao bot as conversas que ele mesmo assumiu; gerente+ devolve qualquer uma

### 4.6 Alerta de "aguardando humano"

- Contador global de conversas aguardando atendimento
- Contador **por sessão** (badge no card do Workspace, ponto no rail)
- **Som** ao surgir uma nova escalada
- **Notificação nativa** do navegador
- Destaque âmbar na linha da conversa
- Selo "Aguardando atendente" no cabeçalho e na lista
- Detecção de **nova** escalada (não só a primeira) na mesma conversa
- Reativação automática do bot depois de 30 minutos de silêncio numa conversa abandonada na fila

### 4.7 Inteligência artificial

- **Resposta automática** ao cliente, com base no histórico da conversa
- **Cérebro da IA** (base de conhecimento por sessão): texto livre com informações do negócio
- **Modo "Assistente Guiado"**: quiz de 8 perguntas essenciais que _gera_ o texto do Cérebro
- **Modo "Texto livre"**: caixa de texto grande com placeholder-exemplo
- **Cadastrar pergunta não respondida** (FAQ manual: pergunta + resposta, anexadas ao Cérebro)
- **Horário de atendimento configurável**: liga/desliga, dias da semana, hora inicial/final, fuso horário, mensagem personalizada de fora do expediente
- **Escalonamento inteligente**: a IA sinaliza quando não sabe responder _ou_ quando o cliente pede um humano — e distingue os dois casos
- **Aviso educado ao cliente** antes de escalar
- **Interpretação de mídia**: a IA "vê" imagens e "ouve" áudios enviados pelo cliente
- **Classificação automática do funil** a cada resposta
- **Regra "só avança"**: a IA nunca move um card para trás no funil
- **Resumo da conversa sob demanda**: um parágrafo do que o cliente quer, o que já foi tratado e o que falta
- **Indicador de resumo desatualizado**
- **Registro de auditoria de cada chamada de IA**: provider, modelo, tokens de entrada/saída, custo em dólares, latência, status
- **Painel "Últimas interações"** no contexto da conversa
- Respostas nunca contêm marcadores internos (são removidos antes de chegar ao cliente)

### 4.8 Pipeline / CRM

- **Board Kanban** com 6 colunas: **Novo · Contatado · Negociando · Fechado · Perdido · Não cliente**
- **Arrastar e soltar** cards entre colunas
- Atualização **otimista** (o card move na hora; se a API falhar, o board recarrega e avisa)
- Card mostra: foto, nome, data da última classificação, **"há N dias neste estágio"**, link "Ver conversa"
- Ícone indicando **quem classificou por último** (robô = IA, pessoa = humano)
- Coluna **"Não cliente"**: tira a conversa do funil comercial e **desliga a IA** naquela conversa
- Card em "Não cliente" mostra "IA desligada" e omite o tempo no estágio
- Contagem de cards por coluna

### 4.9 Tags

- **Catálogo de tags por sessão** (criar, renomear, trocar cor, excluir)
- **Paleta fixa de 8 cores**: cinza, vermelho, laranja, âmbar, verde, teal, azul, roxo
- Seletor de cor por _swatches_ circulares
- **Atribuir/remover tags** numa conversa, pelo painel de contexto
- **Chips de tag na lista de conversas** (até 3 visíveis + "+N")
- Nome único por sessão (bloqueia duplicata)

### 4.10 Analytics

- **Seletor de período** (presets de dias)
- **3 cards de resumo**: Custo de IA no período · Interações de IA · Mensagens (entrada+saída)
- **Gráfico: Uso de IA por dia**
- **Gráfico: Fluxo de mensagens por dia** (entrada vs. saída)
- **Painel: Conversas** (novas conversas por dia + contagem por status)
- **Gráfico: Funil do Pipeline** (barras horizontais por estágio + taxa de conversão)
- **Gráfico: Taxa de escalonamento por dia** (% das conversas que precisaram de humano)
- **Gráfico: Estabilidade da sessão por dia** (quedas de conexão)

### 4.11 Equipe (usuários)

- Listar os usuários da empresa
- Criar usuário (nome, e-mail, cargo) com senha provisória
- Alterar cargo
- Suspender / reativar
- Resetar senha
- **Hierarquia estrita**: só se gerencia quem está _estritamente abaixo_; o dono é intocável

### 4.12 Auditoria

- Trilha append-only de tudo que aconteceu
- Filtro por tipo de ação
- Paginação ("Carregar mais")
- Rótulos traduzidos das ações
- Visível a partir de **gerente** (mais permissivo que Equipe, que é administrador+)

### 4.13 Transversais

- **Tema claro e escuro**, com alternador no cabeçalho e sem "flash" ao carregar
- **Contrato de 4 estados** em toda tela: Carregando (esqueletos) / Vazio (convite) / Erro (com "Tentar de novo") / Conteúdo
- _**Toasts**_ para confirmação e erro de ações
- Diálogos de confirmação para ações destrutivas
- Título de página próprio em cada tela (padrão "Página · Francis")
- Rótulos e mensagens **100% em português do Brasil**

---

## 5. Funcionamento de cada tela

### 5.1 Conversas — `/sessions/:nome/conversations`

**A tela mais usada do produto. É onde o operador passa o dia.**

O layout de três colunas descrito na seção 2 é o coração. Detalhes de comportamento:

- **A lista é viva.** Novas conversas aparecem no topo sozinhas; a ordem é por atividade mais recente.
- **Os filtros funcionam em dois níveis diferentes** (invisível para o usuário, mas relevante para o design): "Todas / Aguardando / IA / Humano" são resolvidos no servidor (recarregam a lista); "Não lidas" é resolvido no cliente sobre o que já foi carregado. Isso significa que "Não lidas" e a busca **não alcançam conversas ainda não carregadas** — o design não deve prometer o contrário.
- **Abrir uma conversa:** a coluna do meio carrega, rola até o fim, e o contador de não lidas zera.
- **O composer só existe quando a conversa está sob atendimento humano.** Nos outros casos, o rodapé mostra uma frase:
  - Se a IA está respondendo normalmente: _"A IA está respondendo esta conversa. Clique em 'Assumir conversa' acima para responder você mesmo."_
  - Se a IA pediu ajuda: _"A IA pediu ajuda humana nesta conversa e continua respondendo enquanto ninguém assume. Clique em 'Assumir conversa' acima para atender você mesmo."_
- **O painel de contexto busca os próprios dados** e se atualiza sozinho.

### 5.2 Pipeline — `/sessions/:nome/pipeline`

Board Kanban horizontal, com rolagem lateral. Seis colunas fixas, nesta ordem:

`Novo → Contatado → Negociando → Fechado → Perdido → Não cliente`

- Cada coluna tem um cabeçalho com o **nome** e a **contagem** de cards.
- Cards são **arrastáveis** entre colunas.
- Ao soltar, o card muda de coluna **imediatamente** (otimista) e a gravação acontece em segundo plano. Se falhar, aparece um _toast_ vermelho e o board recarrega.
- **"Não cliente" é conceitualmente diferente das outras cinco.** As cinco primeiras são estágios do funil de vendas; "Não cliente" é uma exclusão (amigo, fornecedor, funcionário falando no mesmo número da empresa). Arrastar para lá **desliga a IA** naquela conversa e a remove do funil de Analytics. Arrastar de volta religa.
- Cada card leva à conversa por um link "Ver conversa".

### 5.3 Analytics — `/sessions/:nome/analytics`

_(Só administrador/dono.)_

Página de leitura, rolagem vertical. Estrutura:

1. Cabeçalho: título "Analytics" + nota técnica discreta + **seletor de período** à direita.
2. **Faixa de 3 cards de métrica** (grid de 3 colunas em `sm+`).
3. **Seis blocos de gráfico**, cada um num card com título, subtítulo explicativo opcional e o gráfico.

Os gráficos são de linha e de barra. Todos têm estado de carregamento, erro e vazio.

> Observação para o design: o **Funil do Pipeline** é um retrato _atual_ (não muda com o período selecionado) — isso está escrito na tela e deve continuar claro.

### 5.4 IA — `/sessions/:nome/ai`

_(Só administrador/dono.)_

Cabeçalho: título "IA" + subtítulo _"O que o Francis sabe sobre o seu negócio e as frases prontas do atendente."_

Duas abas:

**Aba "Cérebro da IA"** — a base de conhecimento daquele WhatsApp. Contém, por sua vez, dois modos:

- **Assistente Guiado**: um wizard de 8 perguntas essenciais (nome do negócio, o que vende, preços, horário, endereço, formas de pagamento, diferencial, tom de voz), uma por tela, com barra de progresso. Ao terminar, gera um texto formatado e **acrescenta** ao conteúdo existente.
- **Texto livre**: uma caixa de texto grande (até 20.000 caracteres) com um placeholder-exemplo estruturado, contador de caracteres e botão de salvar.
- **Botão "Cadastrar pergunta não respondida"**: abre um diálogo com dois campos (Pergunta / Resposta) e anexa um bloco `P: … / R: …` ao final do texto.
- **Bloco "Horário de atendimento"**: interruptor de liga/desliga, seleção de dias da semana (pílulas Dom–Sáb), hora inicial e final, seletor de fuso horário e uma mensagem personalizada para fora do expediente.

**Aba "Respostas Rápidas"** — lista de frases prontas. Formulário no topo (caixa de texto + "Adicionar"), lista embaixo com editar (inline) e excluir por linha.

### 5.5 Configurações — `/sessions/:nome/settings`

Quatro abas, **cada uma com seu próprio gate de cargo**:

| Aba           | Quem vê                        | Conteúdo                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conexão**   | Todos                          | Card de identidade da sessão (nome, número, geração, conectado desde, última atividade, criada em, selo de status) · Ações (conectar/desconectar/remover) · **Card de QR Code** com passo a passo numerado · Card "Histórico recente" das transições de status. |
| **Equipe**    | Administrador / Dono           | Tabela de usuários com nome, e-mail, cargo (seletor), status; formulário de novo usuário; ações por linha (resetar senha, suspender, reativar).                                                                                                                 |
| **Auditoria** | Gerente / Administrador / Dono | Tabela da trilha de eventos com filtro por ação e "Carregar mais".                                                                                                                                                                                              |
| **Tags**      | Administrador / Dono           | Formulário de nova tag (nome + seletor de 8 cores em swatches) e lista das tags existentes com editar inline e excluir.                                                                                                                                         |

Se o usuário pedir uma aba que seu cargo não vê, cai em "Conexão" (sempre visível).

### 5.6 Workspace — `/`

Já descrito na seção 2. É uma tela de **escolha**, não de trabalho — deve ser calma, espaçosa e rápida de escanear.

### 5.7 Login — `/login`

Tela dividida em duas partes (~40/60):

- **Lado visual**: peça gráfica **vetorial** (um mockup estilizado de conversa entre IA e cliente), a marca em destaque, uma headline comercial ("Nenhum cliente sem resposta.") e 3 benefícios curtos.
- **Lado do formulário**: card elevado com campos **Empresa** (com texto auxiliar "O código do seu workspace, recebido ao criar a conta"), **E-mail**, **Senha** (com mostrar/ocultar), botão "Entrar", e um bloco recolhido **"Outras formas de acesso"** com a entrada por chave de API.

---

## 6. Estados das conversas

Esta seção é crítica: o produto tem **quatro eixos de estado independentes e ortogonais** numa mesma conversa. Eles se combinam. O design precisa comunicar todos sem virar uma sopa de selos.

### Eixo 1 — Quem está atendendo (`status`)

| Valor   | Rótulo na UI                                    | Significado                          | Quando aparece                               | Quando muda                                                                                               |
| ------- | ----------------------------------------------- | ------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bot`   | **"Bot respondendo"** (cor de sucesso/verde)    | A IA responde automaticamente.       | Estado inicial de toda conversa.             | Vira `human` quando alguém clica "Assumir conversa".                                                      |
| `human` | **"Atendimento humano"** (cor de atenção/âmbar) | Um operador assumiu; a IA está fora. | Após clique explícito em "Assumir conversa". | Volta a `bot` com "Devolver ao bot", ou automaticamente após 30 min de silêncio numa conversa abandonada. |

**Consequência visual:** o composer só existe quando `human`.

### Eixo 2 — Pedido de socorro (`escalatedAt`)

| Estado      | Rótulo na UI                                     | Significado              |
| ----------- | ------------------------------------------------ | ------------------------ |
| Sem marca   | —                                                | A IA está dando conta.   |
| **Marcado** | **"Aguardando atendente"** (âmbar, com destaque) | A IA pediu ajuda humana. |

**Regra que o design NÃO pode contradizer:** "aguardando atendente" **não significa que a IA parou**. Ela continua respondendo. O selo diz _"alguém deveria olhar isso"_, não _"o cliente está sem resposta"_.

- **Aparece:** quando a IA não sabe responder, quando o cliente pede um humano, ou quando a geração de resposta falha (cota, provedor fora do ar).
- **Some:** só quando um humano de fato assume a conversa.
- **Reaparece:** se a IA pedir ajuda de novo depois, dispara um alerta novo (não é "uma vez só").
- **Prioridade visual:** este selo **sobrepõe** o rótulo de `status`. Uma conversa em `bot` com `escalatedAt` mostra "Aguardando atendente", não "Bot respondendo".

### Eixo 3 — Estágio no funil (`stage`)

Cinco valores, sempre nesta ordem:

| Valor         | Rótulo         | Notas                                                                                              |
| ------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `new`         | **Novo**       | Estado inicial. **Omitido dos selos na lista** — não agrega informação, toda conversa começa aqui. |
| `contacted`   | **Contatado**  | Neutro visualmente.                                                                                |
| `negotiating` | **Negociando** | Tom de atenção.                                                                                    |
| `closed_won`  | **Fechado**    | Tom de sucesso.                                                                                    |
| `closed_lost` | **Perdido**    | Tom destrutivo, atenuado.                                                                          |

Acompanha um segundo dado: **quem classificou por último** (`ai` ou `human`) — exibido só como ícone informativo no card do Pipeline (robô/pessoa), **sem consequência de comportamento**.

**Regra:** a IA reclassifica a cada resposta, inclusive conversas já corrigidas à mão — mas **nunca move um card para trás** no funil.

### Eixo 4 — Fora do funil comercial (`excludedFromPipeline`)

| Estado           | Rótulo                                       | Significado                                           |
| ---------------- | -------------------------------------------- | ----------------------------------------------------- |
| `false` (padrão) | —                                            | Conversa comercial normal.                            |
| `true`           | **"Não cliente"** (selo tracejado, discreto) | Amigo/família/fornecedor/funcionário no mesmo número. |

- **Efeitos:** a IA **para de responder**, a conversa sai do funil de Analytics, e no board vai para a coluna "Não cliente".
- **O histórico continua 100% acessível** — sai só das telas comerciais, nunca do banco.
- **Só um humano marca/desmarca**, arrastando o card no Pipeline. A IA nunca decide isso.
- Na conversa aberta, aparece um indicador só-leitura ("IA desligada") — nunca um botão.

### Estados auxiliares

| Estado                        | Como aparece                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Não lidas** (`unreadCount`) | Badge numérico verde na linha da lista. Zera ao abrir a conversa. Só mensagens **do cliente** contam. |
| **Tags**                      | Chips coloridos (paleta de 8). Até 3 na lista + "+N"; todos no painel de contexto.                    |
| **Resumo da IA**              | Parágrafo + "Gerado há X". Selo **"Desatualizado"** quando chegaram mensagens depois da geração.      |
| **Prévia da última mensagem** | Texto secundário na linha da lista. Para mídia sem legenda, um rótulo ("📷 Imagem", "🎤 Áudio").      |

### Combinação de selos — regra de prioridade obrigatória

Numa linha da lista, **no máximo um selo de "estado principal"** deve ser exibido, nesta ordem de prioridade:

1. **"Aguardando atendente"** (se `escalatedAt`) — vence tudo.
2. **"Não cliente"** (se `excludedFromPipeline`).
3. **Estágio do funil** (se diferente de "Novo").
4. Nada.

Isso é regra atual e deve ser mantida. Somam-se a ela, independentemente: o badge de não lidas, os chips de tag e a prévia da mensagem.

### Estados de sessão de WhatsApp (não de conversa)

| Valor          | Rótulo           | Cor             |
| -------------- | ---------------- | --------------- |
| `connected`    | **Conectado**    | Sucesso (verde) |
| `connecting`   | **Conectando…**  | Atenção (âmbar) |
| `disconnected` | **Desconectado** | Neutro/cinza    |

Sempre acompanhados de um **ponto de status** (`StatusDot`) além do rótulo — cor nunca é o único portador de significado.

---

## 7. Componentes existentes

Inventário completo dos componentes de interface. Você pode **renomear, fundir, dividir ou reconstruir** qualquer um — desde que a função seja preservada.

### 7.1 Navegação e estrutura

| Componente               | Função                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Header`                 | Barra superior global: marca, usuário logado (`e-mail · Cargo`), "Trocar senha", "Sair", alternador de tema.                                                  |
| `SessionRail`            | Rail vertical de ícones da sessão (Conversas/Pipeline/Analytics/IA + Configurações). Mostra o ponto de status da conexão e o ponto de alerta sobre Conversas. |
| `SessionLayout`          | Casca que combina Header + SessionRail + conteúdo.                                                                                                            |
| `ThemeToggle`            | Botão de alternar tema claro/escuro.                                                                                                                          |
| `TabList` / `TabTrigger` | Abas horizontais usadas em IA e Configurações (ícone + rótulo).                                                                                               |

### 7.2 Conversas

| Componente                 | Função                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ConversationInbox`        | Orquestra as três colunas, a busca e os filtros.                                                                                       |
| `ConversationFilterTabs`   | As 5 pílulas de filtro.                                                                                                                |
| `ConversationListItem`     | **Uma linha da lista.** Avatar, nome, timestamp, prévia/status, selo de estado, ponto de aguardando, badge de não lidas, chips de tag. |
| `ConversationDetailPanel`  | A conversa aberta: cabeçalho, ações, timeline, botão de "ir para recentes", composer/aviso. Contém a lógica delicada de scroll.        |
| `ConversationContextPanel` | A 3ª coluna: identidade, chips, "Cliente há X", tags, resumo, últimas interações.                                                      |
| `ConversationActions`      | Botões "Assumir conversa" / "Devolver ao bot" + indicador "IA desligada".                                                              |
| `ConversationStatusBadge`  | O selo de estado da conversa (com a regra de sobreposição do "Aguardando atendente").                                                  |
| `MessageTimeline`          | Lista de bolhas + divisores de data + correlação mensagem↔interação de IA.                                                             |
| `MessageBubble`            | Uma bolha: texto, mídia (imagem/áudio/vídeo/documento/figurinha), legenda, horário, check de enviado, selo "Gerada por IA".            |
| `MessageComposer`          | A caixa de resposta: anexo, respostas rápidas, textarea, botão de envio circular, dica de teclado, prévia de anexo.                    |
| `ContactAvatar`            | Foto de perfil do WhatsApp com fallback de iniciais; realce quando aguardando humano.                                                  |
| `LoadMoreButton`           | Paginação.                                                                                                                             |

### 7.3 Pipeline

| Componente       | Função                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `PipelineBoard`  | O board inteiro: colunas, arrastar-soltar, atualização otimista.                                                  |
| `PipelineColumn` | Uma coluna: cabeçalho com nome + contagem, área de soltar, lista de cards.                                        |
| `PipelineCard`   | Um card: foto, nome, data, "há N dias neste estágio", "Ver conversa", ícone de quem classificou / "IA desligada". |

### 7.4 IA

| Componente                                | Função                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `AiProfilePanel`                          | O "Cérebro da IA": abas Guiado/Texto livre, textarea, contador, horário de atendimento, botão de FAQ.         |
| `AiProfileQuizWizard`                     | O wizard de 8 perguntas com barra de progresso.                                                               |
| `AiProfileFaqDialog`                      | Diálogo "Cadastrar pergunta não respondida" (Pergunta + Resposta).                                            |
| `QuickRepliesPanel`                       | CRUD das respostas rápidas.                                                                                   |
| `ConversationSummarySection`              | O bloco "Resumo da IA" no painel de contexto (texto, timestamp, selo "Desatualizado", botão gerar/atualizar). |
| `AiInteractionPanel` / `AiInteractionRow` | Lista das últimas chamadas de IA (modelo, tokens, custo, latência, status).                                   |
| `AiInteractionStatusBadge`                | Selo de status de uma interação (Sucesso / Resposta rejeitada / Erro do provider).                            |

### 7.5 Tags

| Componente              | Função                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `TagChip`               | Um chip colorido de tag (paleta fixa de 8).                                                 |
| `ConversationTagPicker` | Chips atribuídos + "×" para remover + botão "+ Tag" com dropdown do catálogo.               |
| `TagsPanel`             | CRUD do catálogo: formulário com nome + swatches de cor, lista com editar inline e excluir. |

### 7.6 Conexões

| Componente               | Função                                                         |
| ------------------------ | -------------------------------------------------------------- |
| `WhatsAppAccountCard`    | O card de conta no Workspace.                                  |
| `ConnectWhatsAppDialog`  | Diálogo de conectar novo WhatsApp.                             |
| `CreateSessionForm`      | Formulário de nome da conexão.                                 |
| `SessionConnectionPanel` | A aba "Conexão": identidade, ações, QR, histórico.             |
| `QRCodeCard`             | O QR Code com passo a passo numerado ao lado.                  |
| `SessionActions`         | Conectar / desconectar / remover (com diálogo de confirmação). |
| `HistoryList`            | Transições de status recentes.                                 |
| `StatusBadge`            | Selo Conectado/Conectando/Desconectado.                        |
| `StatusDot`              | O pontinho de status (verde/âmbar/cinza).                      |

### 7.7 Analytics

| Componente                   | Função                                              |
| ---------------------------- | --------------------------------------------------- |
| `AnalyticsRangePicker`       | Seletor de período.                                 |
| `MetricCard`                 | Card de número grande com rótulo e dica.            |
| `AiUsageChart`               | Uso de IA por dia.                                  |
| `MessageFlowChart`           | Mensagens de entrada vs. saída por dia.             |
| `ConversationAnalyticsPanel` | Novas conversas por dia + contagem por status.      |
| `PipelineFunnelChart`        | Barras horizontais por estágio + taxa de conversão. |
| `EscalationRateChart`        | % de conversas que precisaram de humano, por dia.   |
| `SessionStabilityChart`      | Quedas de conexão por dia.                          |

### 7.8 Administração

| Componente            | Função                                                                          |
| --------------------- | ------------------------------------------------------------------------------- |
| `UserManagementPanel` | Tabela de usuários + criar + trocar cargo + suspender/reativar + resetar senha. |
| `AuditLogPanel`       | Tabela da trilha de auditoria com filtro por ação.                              |

### 7.9 Primitivos e estados

| Componente                                                                                                          | Função                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Button` · `Input` · `Textarea` · `Card` · `Badge` · `Dialog` · `Select` · `Table` · `Skeleton` · `Toast`/`Toaster` | Biblioteca base de UI.                                                         |
| `EmptyState`                                                                                                        | Ícone + título + descrição + ação opcional. Tom de **convite**, nunca de erro. |
| `ErrorState`                                                                                                        | Ícone + "Algo deu errado" + descrição + botão "Tentar de novo".                |
| `FrancisLogo` · `FrancisWordmark` · `LoginChatPreview`                                                              | Marca (símbolo, símbolo+nome, peça visual do login).                           |

---

## 8. O que PODE mudar visualmente

**Praticamente tudo.** Considere-se livre para reinventar:

- ✅ **Toda a identidade visual** — a paleta atual (verde-teal `hsl(163 94% 24%)` como primária) foi uma escolha recente e **não é sagrada**. Se uma paleta diferente servir melhor a uma ferramenta de uso prolongado, proponha.
- ✅ **Tipografia** — família, escala, pesos, altura de linha, tracking.
- ✅ **Espaçamentos e densidade** — a densidade atual pode estar apertada ou frouxa demais; recalibre.
- ✅ **Ícones** — o conjunto pode ser trocado inteiro.
- ✅ **Formato dos cards, bordas, sombras, arredondamentos.**
- ✅ **A organização visual dentro de cada tela** — se um dado fica melhor em outro lugar da mesma tela, mova.
- ✅ **A forma de apresentar os selos e chips** — desde que a hierarquia de prioridade da seção 6 seja respeitada.
- ✅ **A largura das colunas, as proporções, o grid.**
- ✅ **Microinterações, transições, estados de hover/foco.**
- ✅ **O tratamento do tema escuro** (que existe e deve continuar existindo, mas pode ser inteiramente repensado).
- ✅ **A peça visual do login.**
- ✅ **Os textos de interface** (rótulos, títulos, mensagens vazias) — desde que continuem em **português do Brasil**, claros e no tom "prestativo, direto e transparente".

---

## 9. O que NÃO pode mudar

### 9.1 Regras de negócio (invioláveis)

1. **A IA continua respondendo automaticamente.** O redesign não pode introduzir nenhum passo que exija ação humana para a IA funcionar.
2. **"Aguardando atendente" ≠ "IA parada".** A IA continua respondendo enquanto ninguém assume. Nenhum texto ou ícone pode sugerir o contrário.
3. **Só um clique humano explícito em "Assumir conversa" tira a IA do circuito.** Não pode ser automático, não pode ser um efeito colateral de abrir a conversa.
4. **O composer só existe em conversa sob atendimento humano.** Nunca mostrar um campo de resposta que não pode ser usado.
5. **Um check ✓, nunca dois checks azuis.** O produto sabe que enviou; **não** sabe se foi entregue nem lido. Prometer isso seria mentir para o operador.
6. **Nunca inventar indicadores.** "Conversas totais", "IA ativa/inativa", "digitando…", waveform real de áudio, "produtos de interesse" — **nada disso existe**. Se um dado não está descrito neste documento, ele não existe e não pode aparecer na tela.
7. **O funil tem exatamente 5 estágios.** "Não cliente" é uma **sexta coluna do board**, mas **não é um estágio do funil** — o gráfico de funil no Analytics continua com 5 barras.
8. **A IA nunca move um card para trás** no funil, e **nunca** marca uma conversa como "Não cliente".
9. **A hierarquia de cargos é fixa** (5 níveis) e os gates de visibilidade descritos na seção 5 devem ser mantidos.
10. **Ordem da lista de conversas: atividade mais recente primeiro.** Não é ordem de criação.
11. **O contador de não lidas conta só mensagens do cliente**, e zera ao abrir a conversa.
12. **Prioridade de selos** conforme a seção 6 — não inverter.

### 9.2 Restrições técnicas (importantes para o escopo)

- **Nenhuma funcionalidade pode ser removida.** Se algo da seção 4 não couber no seu layout, o layout muda — não a funcionalidade.
- **Nenhuma informação pode desaparecer.** Se um dado hoje é exibido, ele continua acessível (pode mudar de lugar, virar um bloco recolhível, entrar num tooltip — mas não sumir).
- **Nada pode depender de dado novo do backend.** O design deve trabalhar exatamente com os dados descritos aqui. Se uma ideia exigir um campo que não existe, ela fica de fora ou vira uma proposta explicitamente marcada como "requer backend".
- **Os endpoints, o banco de dados e o modelo de dados continuam iguais.** Este é um trabalho de **camada de apresentação**.
- **O contrato de 4 estados** (Carregando / Vazio / Erro / Conteúdo) vale para toda tela que busca dados. Nenhuma tela pode ficar em branco enquanto carrega.
- **Acessibilidade não é opcional:** contraste mínimo AA (4.5:1) para texto normal; foco visível em todo elemento interativo; **cor nunca como único portador de significado** (todo estado colorido carrega também ícone ou rótulo).
- **Responsividade obrigatória** nos três pontos descritos (< `lg`, `lg`, `xl`).
- **Tema claro e escuro**, ambos completos.

---

## 10. Objetivo visual

### 10.1 O que extrair do print de referência

O print anexado mostra a tela de Conversas num layout de **quatro faixas verticais**: rail estreito de ícones → lista de conversas → conversa aberta → painel de contexto. **Essa é a estrutura que queremos reconhecer imediatamente ao olhar o resultado final.**

Mas o que faz aquele print funcionar **não é a cor**. É um conjunto de decisões que você deve dissecar e reaplicar com identidade própria:

#### Proporções

As quatro faixas têm larguras deliberadamente desiguais e hierárquicas: um rail mínimo (só ícones, sem rótulo), duas colunas laterais **iguais entre si** e uma área central que fica com todo o espaço restante. A leitura visual é: _"navegar é secundário, escolher é importante, conversar é o assunto, contexto é apoio"_. Essa proporção é o que impede a tela de parecer um painel de controle e a faz parecer um **espaço de trabalho**.

#### Alinhamentos

Tudo se alinha a um número muito pequeno de eixos verticais. Avatar, nome, prévia e chips numa mesma linha compartilham um eixo à esquerda. Timestamp, badges e selos compartilham um eixo à direita. Nada fica "quase alinhado" — ou está no eixo, ou está claramente fora dele por decisão.

#### Hierarquia

Em cada linha da lista há exatamente **um** elemento primário (o nome), **um** secundário (a prévia) e **vários** terciários (hora, selos, chips). A diferença entre os três níveis é feita por **peso e cor**, quase nunca por tamanho. Isso é o que permite ler 30 conversas de relance sem cansar.

#### Pesos visuais

O peso é distribuído com parcimônia: o único elemento de cor sólida saturada na tela é o que **de fato exige ação** (a bolha enviada, o botão primário, o badge de não lidas). Todo o resto vive em escala de cinza com acentos translúcidos. Um selo de estado usa fundo a ~10-20% de opacidade da cor, não a cor cheia.

#### Espaçamentos e respiros

O espaçamento é **generoso na vertical entre grupos** e **apertado dentro de um grupo**. Uma linha de conversa é compacta internamente (avatar/nome/prévia quase colados), mas separada da próxima por uma divisória sutil e respiro suficiente para o alvo de clique ser confortável. É esse contraste rítmico — denso dentro, arejado entre — que dá a sensação de organização.

#### Densidade

Alta densidade de **informação**, baixa densidade de **elementos**. Muitos dados por tela, poucos objetos visuais. Cada dado adicional é acomodado com tipografia e cor, não com uma nova caixa, borda ou card.

#### Ritmo visual

As linhas da lista têm altura constante e previsível. Isso cria um ritmo que o olho aprende em 3 segundos e depois só varre. Qualquer linha que quebre esse ritmo (uma com tags, outra sem) precisa fazê-lo de forma **contida** — crescendo pouco, nunca desalinhando os eixos.

#### Contraste

O contraste é reservado para **estrutura** (fundo da coluna vs. fundo da conversa vs. fundo do painel — três tons muito próximos de um mesmo neutro) e para **ação** (o acento de cor). Nunca para decoração.

#### Distribuição das informações

Cada coluna responde a uma pergunta diferente e **só a ela**:

- Lista → _"com quem preciso falar?"_
- Chat → _"o que foi dito?"_
- Contexto → _"quem é essa pessoa e onde estamos?"_

Nenhum dado é repetido entre colunas sem propósito. Essa disciplina é metade da sensação de calma.

#### Tamanho dos componentes

Elementos interativos são grandes o suficiente para o clique ser confiante (alvos confortáveis), mas visualmente leves — um botão de ícone ocupa área generosa e mostra pouca tinta.

#### Tipografia

Duas ou três variações de tamanho no máximo por região, diferenciadas principalmente por **peso** (regular / medium / semibold) e **cor** (primária / secundária / terciária). Texto pequeno não é usado para "caber mais coisa"; é usado para **rebaixar hierarquia**.

#### Bordas, sombras e arredondamentos

- **Bordas**: usadas para separar **regiões estruturais** (colunas, cabeçalhos), quase nunca para delimitar elementos individuais. Uma borda por elemento é quase sempre uma borda demais.
- **Sombras**: mínimas e funcionais — apenas para o que **flutua de verdade** (menus suspensos, diálogos, o botão flutuante de "ir para recentes"). Card não precisa de sombra para existir.
- **Arredondamentos**: consistentes e de escala pequena/média. Um raio para elementos pequenos, um maior para superfícies grandes, círculo completo para pílulas e avatares. Nunca três raios diferentes na mesma linha.

#### Sensação premium

A sensação premium do print **não vem de efeitos**. Vem de: consistência absoluta de espaçamento, ausência de elementos supérfluos, alinhamento sem exceções, e uma paleta que se comporta. É "premium por subtração".

### 10.2 O resultado esperado

Uma interface que, ao ser vista lado a lado com o print, faça alguém dizer _"é claramente a mesma família de produto"_ — mas que tenha **identidade própria do Francis**: não uma cópia, e sim uma interpretação mais refinada, mais consistente e mais bem resolvida do que o mockup original.

Se o print é um bom rascunho da ideia, queremos a versão que um time de design de produto entregaria depois de três iterações.

---

## 11. Filosofia de Design

### O objetivo não é uma dashboard bonita

O objetivo é uma ferramenta onde **um operador consiga trabalhar 10 horas por dia sem cansar a visão** e sem cansar a cabeça.

Isso muda tudo. Uma tela que impressiona em 5 segundos pode ser insuportável na oitava hora. Estamos otimizando para a **oitava hora**, não para o primeiro screenshot.

### O que a interface deve transmitir

| Qualidade        | Como se manifesta                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| **Organização**  | Cada coisa tem um lugar, e esse lugar nunca muda.                                                           |
| **Leveza**       | Pouca tinta na tela. Muito espaço. Nenhum elemento pesando sem função.                                      |
| **Rapidez**      | Estados de carregamento que preservam o layout (esqueletos, não spinners). Nada "pula".                     |
| **Confiança**    | Feedback claro para toda ação. Nenhuma ambiguidade sobre o que o sistema fez.                               |
| **Simplicidade** | O caminho óbvio é o caminho certo. Nenhuma funcionalidade escondida atrás de um gesto que ninguém descobre. |
| **Sofisticação** | Refinamento em detalhes que ninguém nota conscientemente: alinhamento, ritmo, consistência.                 |

### Referências de linguagem

Pense em **Apple**, **Linear**, **Notion**, **Raycast**, **Arc Browser**.

O que essas ferramentas têm em comum, e que queremos:

- **Poucos elementos.** Se dá para tirar, tire.
- **Muito espaço em branco.** O vazio é um elemento de design, não desperdício.
- **Nada chamando atenção sem necessidade.** Um elemento só "grita" quando de fato exige ação.
- **Consistência extrema.** O mesmo tipo de coisa tem sempre a mesma aparência, em toda tela.
- **Alinhamento extremo.** Poucos eixos, respeitados sem exceção.
- **Previsibilidade extrema.** O usuário nunca é surpreendido pela interface — só pelo conteúdo.
- **Sem excesso de cores.** Um acento, tons neutros e as cores semânticas de estado. Só.
- **Sem excesso de bordas.** Separe com espaço antes de separar com linha.
- **Sem excesso de sombras.** Elevação só para o que realmente flutua.
- **Sem poluição visual.** Nenhum gradiente decorativo, nenhuma ilustração que não comunica, nenhum ícone que não ajuda.

### Um teste prático

Antes de fechar cada tela, faça estas perguntas:

1. Se eu remover este elemento, o operador perde alguma capacidade? _(Se não: remova.)_
2. Este elemento colorido exige ação, ou é só decoração? _(Se é decoração: neutralize.)_
3. Esta borda separa regiões estruturais, ou só contorna uma caixa? _(Se só contorna: apague.)_
4. Um operador na oitava hora consegue varrer esta lista sem esforço? _(Se não: reduza ruído.)_
5. Este dado está aqui porque o usuário precisa dele **agora**, ou porque o backend o oferece? _(Se é o segundo: rebaixe ou recolha.)_

---

## Resultado esperado da sua entrega

Um redesign completo da Dashboard do Francis que:

1. **Preserve 100% das funcionalidades** listadas na seção 4 e respeite integralmente as regras da seção 9.
2. **Lembre imediatamente o print de referência** na estrutura e na sensação — mas com identidade própria, mais consistente e mais refinada.
3. **Eleve drasticamente a qualidade visual** e a experiência de uso prolongado.
4. **Funcione em tema claro e escuro**, e nos três pontos de responsividade.
5. **Seja implementável sem nenhum dado novo** do backend.

O alvo é simples de enunciar e difícil de atingir: **a melhor dashboard de atendimento do mercado brasileiro** — não pela quantidade de recursos, mas pela clareza com que apresenta os que já tem.

---

_Documento produzido pelo time de engenharia do Francis a partir do estado real da aplicação em 2026-08-06. Toda funcionalidade descrita aqui está implementada e em uso._
