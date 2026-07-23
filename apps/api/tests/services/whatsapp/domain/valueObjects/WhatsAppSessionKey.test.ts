import { WhatsAppSessionKey } from '../../../../../src/services/whatsapp/domain/valueObjects/WhatsAppSessionKey';

const RESERVED_SEPARATOR_CHAR = String.fromCharCode(0);

describe('WhatsAppSessionKey', () => {
  describe('construcao e validacao', () => {
    it('cria uma chave valida a partir de tenantId e sessionName', () => {
      const key = new WhatsAppSessionKey('tenant-1', 'vendas');
      expect(key.tenantId).toBe('tenant-1');
      expect(key.sessionName).toBe('vendas');
    });

    it('lanca erro se tenantId for vazio', () => {
      expect(() => new WhatsAppSessionKey('', 'vendas')).toThrow(/tenantId/);
    });

    it('lanca erro se tenantId contiver apenas espacos em branco', () => {
      expect(() => new WhatsAppSessionKey('   ', 'vendas')).toThrow(/tenantId/);
    });

    it('lanca erro se sessionName for vazio', () => {
      expect(() => new WhatsAppSessionKey('tenant-1', '')).toThrow(/sessionName/);
    });

    it('lanca erro se tenantId contiver o caractere separador reservado', () => {
      const invalidTenantId = ['tenant', RESERVED_SEPARATOR_CHAR, '1'].join('');
      expect(() => new WhatsAppSessionKey(invalidTenantId, 'vendas')).toThrow(/tenantId/);
    });

    it('lanca erro se sessionName contiver o caractere separador reservado', () => {
      const invalidSessionName = ['ven', RESERVED_SEPARATOR_CHAR, 'das'].join('');
      expect(() => new WhatsAppSessionKey('tenant-1', invalidSessionName)).toThrow(/sessionName/);
    });
  });

  describe('imutabilidade', () => {
    it('esta congelada (Object.isFrozen) apos a construcao', () => {
      const key = new WhatsAppSessionKey('tenant-1', 'vendas');
      expect(Object.isFrozen(key)).toBe(true);
    });

    it('lanca TypeError ao tentar reatribuir um campo (modo estrito)', () => {
      const key = new WhatsAppSessionKey('tenant-1', 'vendas');
      expect(() => {
        (key as { tenantId: string }).tenantId = 'outro-tenant';
      }).toThrow(TypeError);
    });
  });

  describe('equals - igualdade por valor', () => {
    it('retorna true para duas instancias com os mesmos dados', () => {
      const a = new WhatsAppSessionKey('tenant-1', 'vendas');
      const b = new WhatsAppSessionKey('tenant-1', 'vendas');
      expect(a.equals(b)).toBe(true);
      expect(a).not.toBe(b); // instancias distintas - igualdade nao e por referencia
    });

    it('retorna false se tenantId divergir', () => {
      const a = new WhatsAppSessionKey('tenant-1', 'vendas');
      const b = new WhatsAppSessionKey('tenant-2', 'vendas');
      expect(a.equals(b)).toBe(false);
    });

    it('retorna false se sessionName divergir', () => {
      const a = new WhatsAppSessionKey('tenant-1', 'vendas');
      const b = new WhatsAppSessionKey('tenant-1', 'suporte');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('toString - representacao canonica', () => {
    it('e deterministica para os mesmos dados', () => {
      const a = new WhatsAppSessionKey('tenant-1', 'vendas');
      const b = new WhatsAppSessionKey('tenant-1', 'vendas');
      expect(a.toString()).toBe(b.toString());
    });

    it('nao colide entre pares que colidiriam com um separador ingenuo como ":"', () => {
      // Se o separador canonico fosse ':' (em vez do caractere reservado
      // usado de fato), estes dois pares LOGICAMENTE DIFERENTES produziriam
      // a mesma string ("a:b:c"): pair1 = tenantId="a:b" + sessionName="c";
      // pair2 = tenantId="a" + sessionName="b:c". ':' nao e o caractere
      // reservado por este VO, entao ambos sao valores validos - o teste
      // comprova que o separador escolhido nao colide neste caso classico.
      const pair1 = new WhatsAppSessionKey('a:b', 'c');
      const pair2 = new WhatsAppSessionKey('a', 'b:c');
      expect(pair1.toString()).not.toBe(pair2.toString());
    });

    it('pode ser usada como chave de Map, agrupando corretamente por valor logico', () => {
      const map = new Map<string, string>();
      const keyA1 = new WhatsAppSessionKey('tenant-1', 'vendas');
      const keyA2 = new WhatsAppSessionKey('tenant-1', 'vendas');
      const keyB = new WhatsAppSessionKey('tenant-2', 'vendas');

      map.set(keyA1.toString(), 'primeiro-valor');
      map.set(keyA2.toString(), 'segundo-valor'); // mesma chave logica - sobrescreve
      map.set(keyB.toString(), 'terceiro-valor');

      expect(map.size).toBe(2);
      expect(map.get(keyA1.toString())).toBe('segundo-valor');
      expect(map.get(keyB.toString())).toBe('terceiro-valor');
    });
  });
});
