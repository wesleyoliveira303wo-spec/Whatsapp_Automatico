/**
 * Landing page (2026-08-29) — TODA a copy da página vive aqui, como dado.
 * Motivo: separar texto de marcação torna a revisão de copy (CRO) trivial,
 * mantém os componentes de seção focados em layout, e deixa cada string
 * testável. Nada aqui é inventado — cada recurso citado existe no produto
 * (ver CLAUDE.md §18 / DECISIONS.md).
 *
 * Preços (Lançamento suave, T5 — ver `CONTEXT.md`): Grátis = R$ 0 (só
 * visualização — a IA NÃO responde), Pro = R$ 99/mês (1 número, uso
 * completo), Enterprise = R$ 349/mês (até 5 números). Sem cobrança
 * automática: o cliente cria a conta Grátis e ativa o plano pago falando
 * com o comercial no WhatsApp (21) 98292-5941 (Billing manual).
 */

export const NAV_LINKS = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#ia', label: 'IA' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#planos', label: 'Planos' },
  { href: '#perguntas', label: 'Perguntas' },
] as const;

export const HERO = {
  eyebrow: 'Atendimento no WhatsApp com IA',
  titleTop: 'Seu WhatsApp responde na hora.',
  titleAccent: 'E te chama',
  titleRest: ' quando o cliente precisa de gente.',
  subtitle:
    'O Francis atende seus clientes no WhatsApp com uma IA treinada no seu negócio: responde em segundos, organiza cada lead num funil e passa a conversa pra você no momento certo. Feito pra autônomos e pequenas empresas — sem instalar nada, sem programar.',
  microline: 'Grátis para começar · sem cartão de crédito · conecte seu número em minutos',
} as const;

export const TRUST_CHIPS = [
  'Conexão por QR Code',
  'IA lê áudio e imagem',
  'LGPD: opt-out automático',
  'Vários números na mesma conta',
] as const;

export const PROBLEMA = {
  eyebrow: 'O problema',
  title: 'Você reconhece isso?',
  cards: [
    'Lead manda mensagem às 22h. Quando você vê, já comprou do concorrente que respondeu primeiro.',
    'Você repete a mesma resposta 40 vezes por dia e não sobra tempo pra vender de verdade.',
    'As conversas estão todas no seu celular. Você não sabe quantos negócios estão abertos nem em que pé.',
    'Contratar alguém só pra não perder mensagem sai caro — e ainda tem que treinar.',
  ],
} as const;

export const SOLUCAO = {
  eyebrow: 'A solução',
  title: 'O Francis assume a linha de frente',
  points: [
    {
      title: 'Responde na hora, do seu jeito',
      body: 'A IA aprende sobre o seu negócio e responde cada cliente em segundos, 24h por dia — no tom que você definir.',
    },
    {
      title: 'Organiza cada lead sozinho',
      body: 'Toda conversa entra num funil visual e a IA move o lead de etapa conforme a negociação anda. Você abre o painel e sabe onde agir.',
    },
    {
      title: 'Sabe a hora de te chamar',
      body: 'Quando o cliente pede uma pessoa ou a IA não tem certeza, a conversa vai pra você na hora — nunca fica no vácuo.',
    },
  ],
} as const;

export const RECURSOS = {
  eyebrow: 'Recursos',
  title: 'Tudo que um atendimento no WhatsApp precisa, num lugar só',
  cards: [
    {
      icon: 'brain',
      title: 'Cérebro da IA',
      body: 'Ensine seu negócio uma vez. A IA usa os preços, horários e regras que você escreveu — e nunca inventa o que não sabe.',
    },
    {
      icon: 'handshake',
      title: 'Atendimento humano sem atrito',
      body: 'Assuma qualquer conversa com um clique. O Francis para de responder e devolve o controle quando você quiser.',
    },
    {
      icon: 'kanban',
      title: 'Pipeline automático',
      body: 'Um funil de vendas que se atualiza sozinho — com arrastar e soltar quando você quiser ajustar à mão.',
    },
    {
      icon: 'megaphone',
      title: 'Campanhas com ritmo seguro',
      body: 'Dispare mensagens pra sua base com intervalo controlado e um freio automático se algo sair do esperado.',
    },
    {
      icon: 'chart',
      title: 'Analytics por número',
      body: 'Veja volume de conversas, taxa de escalonamento e o funil de cada WhatsApp conectado.',
    },
    {
      icon: 'tags',
      title: 'Contatos, tags e respostas rápidas',
      body: 'Importe sua lista por planilha, organize com etiquetas e responda com atalhos prontos.',
    },
  ],
} as const;

export const IA_SECTION = {
  eyebrow: 'IA & automação',
  title: 'Uma IA que puxa venda sem inventar história',
  bullets: [
    { strong: 'Treinada no seu negócio', rest: ' — você escreve o que ela precisa saber, ou responde um assistente com perguntas guiadas.' },
    { strong: 'Classifica o lead no funil', rest: ' a cada resposta — Novo, Contatado, Negociando, Fechado.' },
    { strong: 'Entende áudio e imagem', rest: ' que o cliente manda na conversa.' },
    { strong: 'Respeita seu horário de atendimento', rest: ' — fora do expediente, avisa o cliente e registra o lead.' },
    { strong: 'Nunca promete preço ou prazo', rest: ' que você não configurou. Na dúvida, chama um humano.' },
  ],
} as const;

export const COMO_FUNCIONA = {
  eyebrow: 'Como funciona',
  title: 'Do cadastro ao primeiro atendimento em minutos',
  steps: [
    { n: '01', title: 'Crie sua conta grátis', body: 'Menos de um minuto, só e-mail e senha.' },
    { n: '02', title: 'Conecte seu WhatsApp', body: 'Leia um QR Code, igual ao WhatsApp Web. É o seu número de sempre.' },
    { n: '03', title: 'Ensine o Francis sobre o seu negócio', body: 'Escreva o que ele precisa saber ou responda o assistente guiado.' },
    { n: '04', title: 'Ele atende, você acompanha', body: 'A IA responde os clientes e você entra só quando precisa.' },
  ],
} as const;

export const BENEFICIOS = {
  eyebrow: 'Benefícios',
  title: 'O que muda na sua operação',
  rows: [
    {
      feature: 'Resposta imediata 24/7',
      benefit: 'Nenhum lead esperando',
      result: 'Menos negócio perdido pra quem respondeu antes',
    },
    {
      feature: 'IA treinada + anti-alucinação',
      benefit: 'Respostas certas, sem gafe',
      result: 'O cliente confia e avança na conversa',
    },
    {
      feature: 'Funil automático',
      benefit: 'Visão clara do que está aberto',
      result: 'Você foca onde tem dinheiro na mesa',
    },
    {
      feature: 'Handoff na hora certa',
      benefit: 'O cliente nunca fica no vácuo',
      result: 'Reputação de atendimento que responde bem',
    },
  ],
} as const;

export const DIFERENCIAL = {
  eyebrow: 'Por que Francis',
  title: 'Sem Francis, e com Francis',
  sem: [
    'Responde quando dá — e o lead frio esfria mais',
    'A mesma pergunta o dia todo, na mão',
    'Conversas espalhadas no celular',
    'Não sabe o que está aberto',
    'Fora do horário, o lead some',
  ],
  com: [
    'Responde em segundos, sempre',
    'A IA cobre o repetitivo',
    'Tudo num painel, com histórico',
    'Funil sempre atualizado',
    'Fora do horário, o lead fica registrado',
  ],
  note: 'Não é um chatbot de árvore de decisão nem um Intercom gigante. É simples de configurar e feito pro jeito que a pequena empresa vende no WhatsApp.',
} as const;

export const CONFIANCA = {
  eyebrow: 'Confiança',
  title: 'Feito pra você confiar o WhatsApp da empresa',
  signals: [
    { title: 'IA que não inventa', body: 'Sem preço ou prazo que você não configurou.' },
    { title: 'Seus dados na sua conta', body: 'Histórico completo das conversas, sob seu controle.' },
    { title: 'Cargos e permissões', body: 'Cada pessoa da equipe vê só o que precisa.' },
    { title: 'Trilha de auditoria', body: 'Registro de quem fez o quê e quando.' },
    { title: 'LGPD por padrão', body: 'Cliente que pede pra sair é removido automaticamente das campanhas.' },
  ],
  founderQuote:
    'O Francis é construído por quem atende no WhatsApp todo dia. Está em evolução constante, e o seu feedback fala direto com quem constrói o produto.',
  founderName: 'Wesley Francis, fundador',
} as const;

export const PLANOS = {
  eyebrow: 'Planos',
  title: 'Comece grátis. Ative o Pro quando quiser a IA atendendo.',
  free: {
    name: 'Grátis',
    price: 'R$ 0',
    period: '/ sempre',
    tagline: 'Conecte um WhatsApp e veja as mensagens chegando. A IA não responde.',
    features: [
      '1 número de WhatsApp',
      'Mensagens dos clientes na Dashboard em tempo real',
      'Explore Cérebro da IA, Pipeline, Campanhas e Analytics por dentro',
      'A IA não responde e você não envia mensagens pela Dashboard',
    ],
    cta: 'Criar conta grátis',
  },
  pro: {
    name: 'Pro',
    price: 'R$ 99',
    period: '/ mês',
    highlight: true,
    tagline: 'O atendimento com IA funcionando de verdade, em 1 número.',
    features: [
      '1 número de WhatsApp, uso completo',
      'A IA responde seus clientes automaticamente',
      'Atendimento humano com handoff (texto e mídia)',
      'Pipeline automático, Campanhas e Analytics',
      'Contatos, tags, respostas rápidas e resumo de conversa',
    ],
    cta: 'Criar conta grátis',
    ctaNote:
      'Crie a conta no Grátis e chame o comercial no WhatsApp (21) 98292-5941 para ativar o Pro.',
  },
  enterprise: {
    name: 'Enterprise',
    price: 'R$ 349',
    period: '/ mês',
    tagline: 'Para quem atende em vários números de WhatsApp.',
    features: [
      'Até 5 números de WhatsApp',
      'Tudo do plano Pro em cada número',
      'Cada número com seu próprio Cérebro da IA e funil',
    ],
    cta: 'Criar conta grátis',
    ctaNote:
      'Crie a conta no Grátis e chame o comercial no WhatsApp (21) 98292-5941 para ativar o Enterprise.',
  },
  footnote:
    'A cobrança é combinada direto com o comercial (Pix). O plano Grátis não tem compromisso e você pode cancelar quando quiser.',
} as const;

export const FAQ = {
  eyebrow: 'Perguntas frequentes',
  title: 'Antes de criar sua conta',
  items: [
    {
      q: 'Como o Francis funciona?',
      a: 'Você conecta seu WhatsApp por QR Code, ensina a IA sobre o seu negócio e ela passa a responder seus clientes automaticamente. Você acompanha tudo por um painel e assume qualquer conversa quando quiser.',
    },
    {
      q: 'Preciso instalar alguma coisa?',
      a: 'Não. É tudo pelo navegador. A conexão com o WhatsApp é feita lendo um QR Code, igual ao WhatsApp Web.',
    },
    {
      q: 'É o meu número mesmo?',
      a: 'Sim. O Francis usa o seu número de WhatsApp atual. Seus clientes continuam falando com o mesmo contato.',
    },
    {
      q: 'Preciso saber programar?',
      a: 'Não. Você configura tudo escrevendo em português, ou respondendo um assistente com perguntas guiadas.',
    },
    {
      q: 'A IA pode falar uma coisa errada pro cliente?',
      a: 'O Francis só responde com o que você configurou. Ele não inventa preço nem prazo — quando não tem certeza, passa a conversa pra um humano.',
    },
    {
      q: 'Quais canais são suportados?',
      a: 'Hoje, WhatsApp.',
    },
    {
      q: 'Meus dados estão seguros?',
      a: 'O histórico das conversas fica no banco de dados da sua conta, com cargos e permissões por pessoa e trilha de auditoria. Clientes que pedem pra sair são removidos automaticamente das campanhas (LGPD).',
    },
    {
      q: 'Posso cancelar quando quiser?',
      a: 'Sim. O plano Grátis não tem compromisso e você pode desconectar seu WhatsApp a qualquer momento.',
    },
  ],
} as const;

export const CTA_FINAL = {
  title: 'Comece a não perder mais nenhum lead hoje',
  subtitle:
    'Conecte seu WhatsApp e deixe o Francis atender enquanto você foca no que importa.',
  microline: 'Grátis para começar · sem cartão de crédito',
} as const;
