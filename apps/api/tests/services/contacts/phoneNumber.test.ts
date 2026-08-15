import {
  normalizePhoneToE164,
  phoneFromWhatsAppJid,
} from '../../../src/services/contacts/domain/phoneNumber';

describe('normalizePhoneToE164', () => {
  describe('celular brasileiro — o problema do 9º dígito', () => {
    // O caso que motivou a decisão do fundador ("unificar"): na base real
    // existiam celulares nas duas formas, e a mesma pessoa digitada numa
    // planilha com o 9 precisa cair no contato que já existe sem o 9.
    it('acrescenta o 9 a celular antigo de 8 dígitos', () => {
      expect(normalizePhoneToE164('556588887777')).toBe('5565988887777');
    });

    it('mantém intacto o celular que já tem o 9', () => {
      expect(normalizePhoneToE164('5565988887777')).toBe('5565988887777');
    });

    it('as duas formas do MESMO celular produzem a mesma identidade', () => {
      expect(normalizePhoneToE164('556588887777')).toBe(normalizePhoneToE164('5565988887777'));
    });

    it('trata todos os primeiros dígitos de celular (6, 7, 8 e 9)', () => {
      expect(normalizePhoneToE164('556561117777')).toBe('5565961117777');
      expect(normalizePhoneToE164('556571117777')).toBe('5565971117777');
      expect(normalizePhoneToE164('556581117777')).toBe('5565981117777');
      expect(normalizePhoneToE164('556591117777')).toBe('5565991117777');
    });
  });

  describe('telefone fixo — a guarda contra juntar pessoas diferentes', () => {
    // Um fixo 65 3333-4444 jamais pode virar 65 9 3333-4444, que é o celular
    // de OUTRA pessoa. Esta é a regra mais importante do módulo.
    it('nunca acrescenta o 9 a um fixo', () => {
      expect(normalizePhoneToE164('556533334444')).toBe('556533334444');
    });

    it('cobre toda a faixa de fixo (2 a 5)', () => {
      expect(normalizePhoneToE164('556521114444')).toBe('556521114444');
      expect(normalizePhoneToE164('556531114444')).toBe('556531114444');
      expect(normalizePhoneToE164('556541114444')).toBe('556541114444');
      expect(normalizePhoneToE164('556551114444')).toBe('556551114444');
    });

    it('fixo e celular de dígitos parecidos continuam identidades diferentes', () => {
      expect(normalizePhoneToE164('556533334444')).not.toBe(normalizePhoneToE164('556593334444'));
    });
  });

  describe('formatos de escrita', () => {
    it('ignora máscara, espaços, parênteses, hífen e o sinal de mais', () => {
      const esperado = '5521988887777';

      expect(normalizePhoneToE164('+55 21 98888-7777')).toBe(esperado);
      expect(normalizePhoneToE164('(21) 98888-7777')).toBe(esperado);
      expect(normalizePhoneToE164('55 21 9 8888 7777')).toBe(esperado);
      expect(normalizePhoneToE164('5521988887777')).toBe(esperado);
    });

    it('assume Brasil quando o DDI não foi digitado', () => {
      expect(normalizePhoneToE164('21988887777')).toBe('5521988887777');
      expect(normalizePhoneToE164('6588887777')).toBe('5565988887777');
    });
  });

  describe('entradas que NÃO devem virar contato', () => {
    // Um LID tem 15 dígitos e se pareceria com um telefone internacional —
    // cadastrá-lo criaria um "contato" que não é uma pessoa alcançável.
    it('recusa um LID (longo demais)', () => {
      expect(normalizePhoneToE164('225236742053984')).toBeUndefined();
    });

    it('recusa número curto demais para ter DDD', () => {
      expect(normalizePhoneToE164('123')).toBeUndefined();
      expect(normalizePhoneToE164('988887777')).toBeUndefined();
    });

    it('recusa entrada vazia ou sem dígito nenhum', () => {
      expect(normalizePhoneToE164('')).toBeUndefined();
      expect(normalizePhoneToE164('sem numero aqui')).toBeUndefined();
    });

    it('recusa DDD começando com zero', () => {
      expect(normalizePhoneToE164('550188887777')).toBeUndefined();
    });
  });

  describe('números estrangeiros', () => {
    it('devolve os dígitos sem aplicar a regra brasileira do 9', () => {
      // +351 (Portugal) — 12 dígitos, não começa com 55.
      expect(normalizePhoneToE164('+351 912 345 678')).toBe('351912345678');
    });
  });
});

describe('phoneFromWhatsAppJid', () => {
  it('extrai e normaliza o telefone de um JID comum', () => {
    expect(phoneFromWhatsAppJid('5521988887777@s.whatsapp.net')).toBe('5521988887777');
  });

  it('normaliza o 9º dígito também vindo do JID', () => {
    expect(phoneFromWhatsAppJid('556588887777@s.whatsapp.net')).toBe('5565988887777');
  });

  // 13 das 51 conversas da base real são LID: não há telefone a extrair, e
  // essas conversas ficam sem contato até a pessoa escrever de um endereço
  // com número real.
  it('devolve undefined para LID (endereço de privacidade, sem telefone)', () => {
    expect(phoneFromWhatsAppJid('225236742053984@lid')).toBeUndefined();
  });

  it('devolve undefined para grupo e para canal', () => {
    expect(phoneFromWhatsAppJid('123456789-987654321@g.us')).toBeUndefined();
    expect(phoneFromWhatsAppJid('123456789@newsletter')).toBeUndefined();
  });

  it('devolve undefined para JID malformado', () => {
    expect(phoneFromWhatsAppJid('5521988887777')).toBeUndefined();
    expect(phoneFromWhatsAppJid('@s.whatsapp.net')).toBeUndefined();
  });
});
