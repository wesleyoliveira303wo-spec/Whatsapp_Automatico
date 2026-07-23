import { buildWhatsAppCredentialsNamespace } from '../../../../src/services/whatsapp/domain/credentialsNamespace';

/**
 * Testa só o formato da string produzida — função pura, sem I/O. Os call
 * sites reais (`BaileysProvider`, `WhatsAppSessionService.removeSession()`)
 * já têm cobertura própria de que USAM esta função; este arquivo garante
 * que o FORMATO em si (`whatsapp:session:<sessionName>`) permanece estável,
 * já que mudá-lo silenciosamente órfãaria credenciais já persistidas sob o
 * formato antigo (ver docstring do arquivo de produção).
 */
describe('buildWhatsAppCredentialsNamespace', () => {
  it('produz o formato whatsapp:session:<sessionName>', () => {
    expect(buildWhatsAppCredentialsNamespace('vendas')).toBe('whatsapp:session:vendas');
  });

  it('preserva o sessionName exatamente como recebido (sem normalização)', () => {
    expect(buildWhatsAppCredentialsNamespace('default')).toBe('whatsapp:session:default');
    expect(buildWhatsAppCredentialsNamespace('Suporte-N1')).toBe('whatsapp:session:Suporte-N1');
  });
});
