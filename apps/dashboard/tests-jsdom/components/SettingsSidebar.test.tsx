/**
 * Reestruturação de Configurações, Fase 3/8 (2026-08-27, ver
 * `CONFIGURACOES_REDESIGN_PLAN.md`) — a barra de abas horizontal virou uma
 * sidebar com grupos rotulados. Estes testes travam:
 *
 * - os grupos (EMPRESA / CANAIS / PESSOAS / REGISTROS), que comunicam o
 *   ESCOPO que faltava ("minha empresa" ≠ "minhas pessoas" ≠ "meus canais");
 * - o gate por papel na UI — que é CORTESIA: esconder o item não substitui
 *   a autorização do backend (ver `settingsPage.test.tsx` para o gate real
 *   de rota, e o RBAC da API para a barreira de verdade);
 * - links reais (`<a href>`), não `onClick` — deep-link, Ctrl+clique, F5.
 */
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsSidebar from '../../components/SettingsSidebar';

jest.mock('next/router', () => ({ useRouter: () => ({ asPath: '/settings/empresa' }) }));

describe('SettingsSidebar', () => {
  const base = '/settings';

  it('owner vê todas as 6 seções', () => {
    render(<SettingsSidebar active="empresa" role="owner" basePath={base} />);
    for (const label of [
      'Dados da empresa',
      'Atendimento',
      'WhatsApps',
      'Equipe',
      'Segurança',
      'Auditoria',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('operator vê só o que alcança — sem Equipe, Segurança ou Auditoria', () => {
    render(<SettingsSidebar active="empresa" role="operator" basePath={base} />);
    expect(screen.getByRole('link', { name: 'Dados da empresa' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApps' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Equipe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Segurança' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Auditoria' })).not.toBeInTheDocument();
  });

  it('manager vê Auditoria, mas não Equipe nem Segurança', () => {
    render(<SettingsSidebar active="empresa" role="manager" basePath={base} />);
    expect(screen.getByRole('link', { name: 'Auditoria' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Equipe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Segurança' })).not.toBeInTheDocument();
  });

  it('administrator vê Equipe e Auditoria, mas Segurança é só do owner', () => {
    render(<SettingsSidebar active="empresa" role="administrator" basePath={base} />);
    expect(screen.getByRole('link', { name: 'Equipe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Auditoria' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Segurança' })).not.toBeInTheDocument();
  });

  it('grupos vazios não deixam rótulo órfão na tela', () => {
    render(<SettingsSidebar active="empresa" role="operator" basePath={base} />);
    // PESSOAS e REGISTROS não têm item visível para operator.
    expect(screen.queryByText('PESSOAS')).not.toBeInTheDocument();
    expect(screen.queryByText('REGISTROS')).not.toBeInTheDocument();
    expect(screen.getByText('EMPRESA')).toBeInTheDocument();
    expect(screen.getByText('CANAIS')).toBeInTheDocument();
  });

  it('cada item é um link real para a URL da seção (deep-link, Ctrl+clique)', () => {
    render(<SettingsSidebar active="empresa" role="owner" basePath={base} />);
    expect(screen.getByRole('link', { name: 'Equipe' })).toHaveAttribute(
      'href',
      '/settings/equipe',
    );
    expect(screen.getByRole('link', { name: 'Auditoria' })).toHaveAttribute(
      'href',
      '/settings/auditoria',
    );
  });

  it('respeita o basePath — dentro de uma sessão, os links carregam a sessão', () => {
    render(
      <SettingsSidebar active="whatsapps" role="owner" basePath="/sessions/vendas/settings" />,
    );
    expect(screen.getByRole('link', { name: 'WhatsApps' })).toHaveAttribute(
      'href',
      '/sessions/vendas/settings/whatsapps',
    );
  });

  it('a seção ativa é anunciada para leitores de tela (aria-current)', () => {
    render(<SettingsSidebar active="equipe" role="owner" basePath={base} />);
    expect(screen.getByRole('link', { name: 'Equipe' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Auditoria' })).not.toHaveAttribute('aria-current');
  });

  it('a navegação tem nome acessível próprio', () => {
    render(<SettingsSidebar active="empresa" role="owner" basePath={base} />);
    const nav = screen.getByRole('navigation', { name: 'Seções de Configurações' });
    expect(within(nav).getAllByRole('link').length).toBeGreaterThan(0);
  });
});
