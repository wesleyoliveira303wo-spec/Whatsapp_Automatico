/**
 * T6 (Lançamento suave) — conteúdo das páginas legais `/termos` e
 * `/privacidade`. Texto como dado (mesmo padrão de `landingContent.ts`):
 * fácil de revisar, e cada seção é testável.
 *
 * Enxuto de propósito e específico ao que o produto realmente faz — um
 * atendimento no WhatsApp que guarda as conversas dos clientes de PMEs
 * brasileiras. Nada aqui descreve recurso que não existe.
 *
 * Isto NÃO é aconselhamento jurídico. Antes de um lançamento amplo, um
 * advogado deve revisar (ver `CONTEXT.md` / roadmap do Lançamento suave).
 */

const CONTATO_EMAIL = 'wesleyoliveira303.wo@gmail.com';
const CONTATO_WHATSAPP = '(21) 98292-5941';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDoc {
  slug: 'termos' | 'privacidade';
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
}

export const TERMOS: LegalDoc = {
  slug: 'termos',
  title: 'Termos de Uso',
  updatedAt: '2 de setembro de 2026',
  intro:
    'Estes Termos regem o uso do Francis, uma plataforma de atendimento no WhatsApp com inteligência artificial. Ao criar uma conta, você concorda com o que está descrito aqui.',
  sections: [
    {
      heading: '1. O que o Francis faz',
      paragraphs: [
        'O Francis conecta o seu número de WhatsApp por QR Code e passa a responder seus clientes automaticamente com uma IA configurada por você, organiza cada conversa num funil e devolve o atendimento para uma pessoa quando necessário.',
        'O serviço é oferecido "como está" e está em evolução constante. Não garantimos disponibilidade ininterrupta.',
      ],
    },
    {
      heading: '2. Sua conta e seu uso',
      paragraphs: [
        'Você é responsável por manter a confidencialidade da sua senha e por toda atividade realizada na sua conta.',
        'Você deve usar apenas um número de WhatsApp que seja seu ou que você esteja autorizado a operar, e cumprir a legislação aplicável e as políticas da Meta/WhatsApp.',
        'É proibido usar o Francis para spam, mensagens não solicitadas em massa, fraude ou qualquer atividade ilícita.',
      ],
    },
    {
      heading: '3. Conexão com o WhatsApp',
      paragraphs: [
        'A integração com o WhatsApp é feita por um método não oficial. O WhatsApp/Meta pode, a qualquer momento e sem aviso, limitar ou bloquear um número. Esse risco é seu, e o Francis não se responsabiliza por bloqueios impostos pela Meta.',
      ],
    },
    {
      heading: '4. Planos e pagamento',
      paragraphs: [
        'O Plano Grátis permite conectar um número e acompanhar as mensagens; a IA não responde e o envio pela plataforma fica indisponível.',
        'Os planos pagos (Pro e Enterprise) liberam o uso completo. Não há cobrança automática: a ativação e o pagamento (Pix) são combinados diretamente com o comercial pelo WhatsApp ' +
          CONTATO_WHATSAPP +
          '.',
        'Se um plano pago deixar de ser pago, a conta volta ao modo do Plano Grátis, sem perda dos dados já registrados.',
      ],
    },
    {
      heading: '5. Encerramento',
      paragraphs: [
        'Você pode desconectar seu WhatsApp e parar de usar o Francis a qualquer momento. Mediante solicitação, apagamos todos os dados da sua conta (ver a Política de Privacidade).',
        'Podemos suspender ou encerrar contas que violem estes Termos.',
      ],
    },
    {
      heading: '6. Contato',
      paragraphs: [
        'Dúvidas sobre estes Termos: ' + CONTATO_EMAIL + ' ou WhatsApp ' + CONTATO_WHATSAPP + '.',
      ],
    },
  ],
};

export const PRIVACIDADE: LegalDoc = {
  slug: 'privacidade',
  title: 'Política de Privacidade',
  updatedAt: '2 de setembro de 2026',
  intro:
    'Esta Política explica quais dados o Francis coleta, para que os usa e quais são os seus direitos, em linha com a Lei Geral de Proteção de Dados (LGPD).',
  sections: [
    {
      heading: '1. Dados que coletamos',
      paragraphs: [
        'Cadastro: nome, e-mail e senha (armazenada apenas como hash).',
        'Operação: as conversas trocadas pelo número de WhatsApp conectado — mensagens de texto, áudio, imagem e documentos —, os contatos dessas conversas e os dados que você cadastra sobre eles (nome, etiquetas, estágio no funil).',
        'Conteúdo que você fornece à IA: o texto do "Cérebro da IA" e as respostas rápidas que você escreve.',
        'Uso: registros de acesso e ações na plataforma (trilha de auditoria) e métricas agregadas da sua operação.',
      ],
    },
    {
      heading: '2. Para que usamos',
      paragraphs: [
        'Operar o atendimento: receber e exibir mensagens, gerar as respostas automáticas da IA, organizar o funil e permitir o atendimento humano.',
        'Gerar métricas da sua própria operação (volume de conversas, taxa de escalonamento, funil).',
        'Manter a segurança da plataforma e cumprir obrigações legais.',
      ],
    },
    {
      heading: '3. Compartilhamento',
      paragraphs: [
        'Para gerar as respostas da IA, o conteúdo necessário da conversa é enviado ao provedor de modelo de linguagem contratado, exclusivamente para produzir a resposta.',
        'Não vendemos seus dados nem os de seus clientes, e não os usamos para publicidade.',
      ],
    },
    {
      heading: '4. Retenção',
      paragraphs: [
        'Os dados ficam armazenados enquanto a sua conta existir. O histórico das conversas fica no banco de dados vinculado à sua conta, sob o seu controle.',
      ],
    },
    {
      heading: '5. Seus direitos e a exclusão a pedido',
      paragraphs: [
        'Você pode solicitar a exclusão de todos os dados da sua conta. Ao receber o pedido, apagamos as conversas, mensagens, contatos, campanhas, perfis de IA, usuários e registros associados ao seu tenant.',
        'Clientes finais que pedem para não receber mais mensagens ("PARAR", "SAIR" e termos equivalentes) são removidos automaticamente das campanhas (opt-out).',
        'Para exercer seus direitos: ' + CONTATO_EMAIL + '.',
      ],
    },
    {
      heading: '6. Segurança',
      paragraphs: [
        'O acesso é protegido por autenticação, cargos e permissões por pessoa e trilha de auditoria. Ainda assim, nenhum sistema é totalmente imune a incidentes.',
      ],
    },
    {
      heading: '7. Contato',
      paragraphs: [
        'Encarregado pelo tratamento de dados: Wesley Francis — ' +
          CONTATO_EMAIL +
          ' / WhatsApp ' +
          CONTATO_WHATSAPP +
          '.',
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDoc['slug'], LegalDoc> = {
  termos: TERMOS,
  privacidade: PRIVACIDADE,
};
