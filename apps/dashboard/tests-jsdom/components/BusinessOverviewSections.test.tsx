/**
 * Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fases 8/15) —
 * "Horário de atendimento" e "Sobre o negócio" no Perfil. As duas são
 * SOMENTE LEITURA — nenhum teste aqui chama nada que grave ou gere resumo
 * (isso é `BusinessSummaryService`, no backend, coberto em
 * `BusinessSummaryService.test.ts`/`aiProfileRouter.test.ts`).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WorkingHoursSection, BusinessSummarySection } from '../../components/BusinessOverviewSections';
import type { SessionBusinessProfile } from '../../hooks/useAllBusinessProfiles';
import type { AiBusinessProfile } from '../../lib/clientApi';

function fakeProfile(overrides: Partial<AiBusinessProfile> = {}): AiBusinessProfile {
  return {
    tenantId: 't1',
    sessionName: 'vendas',
    content: 'texto do cérebro',
    updatedAt: '2026-08-28T00:00:00.000Z',
    offHoursEnabled: false,
    offHoursMessage: null,
    workingHoursStart: null,
    workingHoursEnd: null,
    workingDays: 62,
    timezone: 'America/Sao_Paulo',
    aiEnabled: true,
    summary: null,
    summaryGeneratedAt: null,
    ...overrides,
  };
}

describe('WorkingHoursSection', () => {
  it('carregando: mostra skeleton, não a lista vazia', () => {
    render(<WorkingHoursSection items={[]} loading errorMessage={null} />);
    expect(screen.queryByText(/Nenhum WhatsApp/)).not.toBeInTheDocument();
  });

  it('erro: mostra a mensagem, não a lista vazia', () => {
    render(<WorkingHoursSection items={[]} loading={false} errorMessage="falhou" />);
    expect(screen.getByRole('alert')).toHaveTextContent('falhou');
  });

  it('sem sessões: estado vazio explicando de onde vem o horário', () => {
    render(<WorkingHoursSection items={[]} loading={false} errorMessage={null} />);
    expect(screen.getByText('Nenhum WhatsApp conectado')).toBeInTheDocument();
  });

  it('sessão sem horário configurado: diz isso, não inventa um horário', () => {
    const items: SessionBusinessProfile[] = [{ sessionName: 'vendas', profile: null }];
    render(<WorkingHoursSection items={items} loading={false} errorMessage={null} />);
    expect(screen.getByText('vendas')).toBeInTheDocument();
    expect(screen.getByText(/Sem horário configurado/)).toBeInTheDocument();
  });

  it('sessão com horário configurado: lista os dias ativos com o horário', () => {
    const items: SessionBusinessProfile[] = [
      {
        sessionName: 'vendas',
        profile: fakeProfile({
          offHoursEnabled: true,
          workingHoursStart: '09:00',
          workingHoursEnd: '18:00',
          workingDays: 62, // Seg–Sex
        }),
      },
    ];
    render(<WorkingHoursSection items={items} loading={false} errorMessage={null} />);
    expect(screen.getByText('Segunda-feira')).toBeInTheDocument();
    expect(screen.getByText('Sexta-feira')).toBeInTheDocument();
    expect(screen.queryByText('Domingo')).not.toBeInTheDocument();
    expect(screen.getAllByText('09:00 – 18:00').length).toBe(5);
  });

  it('cada sessão linka para o Cérebro da IA dela — nunca edita aqui', () => {
    const items: SessionBusinessProfile[] = [{ sessionName: 'vendas', profile: null }];
    render(<WorkingHoursSection items={items} loading={false} errorMessage={null} />);
    expect(screen.getByRole('link', { name: /Cérebro da IA/ })).toHaveAttribute(
      'href',
      '/sessions/vendas/ai',
    );
  });
});

describe('BusinessSummarySection', () => {
  it('cérebro preenchido mas resumo ainda nulo: mostra "Gerando resumo…" (geração assíncrona no backend)', () => {
    const items: SessionBusinessProfile[] = [
      { sessionName: 'vendas', profile: fakeProfile({ content: 'texto do cérebro', summary: null }) },
    ];
    render(<BusinessSummarySection items={items} loading={false} errorMessage={null} />);
    expect(screen.getByText(/Gerando resumo/)).toBeInTheDocument();
  });

  it('cérebro vazio: explica como gerar, não inventa um resumo', () => {
    const items: SessionBusinessProfile[] = [
      { sessionName: 'vendas', profile: fakeProfile({ content: '', summary: null }) },
    ];
    render(<BusinessSummarySection items={items} loading={false} errorMessage={null} />);
    expect(screen.getByText(/Ainda sem resumo/)).toBeInTheDocument();
  });

  it('sessão com resumo cacheado: mostra o texto exatamente como veio do backend', () => {
    const items: SessionBusinessProfile[] = [
      {
        sessionName: 'vendas',
        profile: fakeProfile({ summary: 'A empresa vende bolos sob encomenda.' }),
      },
    ];
    render(<BusinessSummarySection items={items} loading={false} errorMessage={null} />);
    expect(screen.getByText('A empresa vende bolos sob encomenda.')).toBeInTheDocument();
  });

  it('sem sessões: estado vazio', () => {
    render(<BusinessSummarySection items={[]} loading={false} errorMessage={null} />);
    expect(screen.getByText('Nenhum WhatsApp conectado')).toBeInTheDocument();
  });
});
