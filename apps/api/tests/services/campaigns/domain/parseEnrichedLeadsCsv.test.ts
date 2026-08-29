import { parseEnrichedLeadsCsv } from '../../../../src/services/campaigns/domain/policies/parseEnrichedLeadsCsv';

const HEADER =
  'Nome da Empresa,Categoria,Bairro,Status do Site,Nota Google,Qtd Avaliações,Dor Principal Identificada,Gatilho de Prova Social,Tom Recomendado,Ganchos de Abertura,CTA Recomendado,Telefone';

describe('parseEnrichedLeadsCsv (Fase de Prospecção IA)', () => {
  it('parseia uma linha completa, com nota/avaliações e ganchos separados por |', () => {
    const csv = [
      HEADER,
      [
        'Adega Barril do Recreio',
        'Restaurante português',
        'Recreio dos Bandeirantes',
        'Sem Site',
        '4.3',
        '3096',
        'Tem prova social forte mas nenhuma vitrine digital própria.',
        '"Referência consolidada no bairro (3096 avaliações, nota 4.3)"',
        'Direto e consultivo',
        'Gancho um|Gancho dois|Gancho três',
        'Pergunta direta sobre uma ligação rápida',
        '+55 21 2437-4428',
      ].join(','),
    ].join('\n');

    const result = parseEnrichedLeadsCsv(csv);

    expect(result.invalid).toEqual([]);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toEqual({
      companyName: 'Adega Barril do Recreio',
      category: 'Restaurante português',
      neighborhood: 'Recreio dos Bandeirantes',
      siteStatus: 'Sem Site',
      googleRating: 4.3,
      reviewCount: 3096,
      mainPainPoint: 'Tem prova social forte mas nenhuma vitrine digital própria.',
      socialProofTrigger: 'Referência consolidada no bairro (3096 avaliações, nota 4.3)',
      recommendedTone: 'Direto e consultivo',
      openingHooks: ['Gancho um', 'Gancho dois', 'Gancho três'],
      recommendedCta: 'Pergunta direta sobre uma ligação rápida',
      rawPhone: '+55 21 2437-4428',
    });
  });

  it('lead sem nota/avaliações (0) não recebe googleRating, e vira reviewCount 0', () => {
    const csv = [
      HEADER,
      [
        'Matheus Do Frango',
        'Restaurante de frango',
        'Campo Grande',
        'Sem Site',
        '',
        '0',
        'Depende 100% do tráfego orgânico do Google Maps.',
        'Poucas avaliações ainda (0)',
        'Leve e de descoberta',
        'Gancho único',
        'Pergunta aberta e leve sobre planos de crescimento',
        '+55 21 99105-6156',
      ].join(','),
    ].join('\n');

    const result = parseEnrichedLeadsCsv(csv);

    expect(result.leads[0].googleRating).toBeUndefined();
    expect(result.leads[0].reviewCount).toBe(0);
  });

  it('linha com Status do Site inválido vai para invalid, nunca quebra o parse inteiro', () => {
    const csv = [
      HEADER,
      [
        'Empresa Qualquer',
        'Restaurante',
        'Campo Grande',
        'Talvez Tenha Site',
        '4.0',
        '10',
        'Dor qualquer.',
        'Gatilho qualquer.',
        'Tom qualquer.',
        'Gancho único',
        'CTA qualquer.',
        '+55 21 90000-0000',
      ].join(','),
    ].join('\n');

    const result = parseEnrichedLeadsCsv(csv);

    expect(result.leads).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].reason).toBe('site_status_invalido');
  });
});
