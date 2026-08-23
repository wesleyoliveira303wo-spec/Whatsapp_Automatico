/**
 * Onda 2 do redesign (2026-08-23) — testes de `AnimatedNumber`.
 *
 * NOTA sobre o ambiente: `tests-jsdom/setup.ts` liga
 * `MotionGlobalConfig.skipAnimations`, então aqui o componente sempre segue
 * o caminho SEM animação (valor final direto). É exatamente o que se quer
 * testar num teste de unidade — o contrato observável é "mostra o número
 * certo, formatado do jeito certo"; a interpolação em si é responsabilidade
 * do framer-motion, não deste componente.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AnimatedNumber from '../../../components/ui/animated-number';

describe('AnimatedNumber', () => {
  it('mostra o valor final (arredondado) sem formatador', () => {
    render(<AnimatedNumber value={1234} />);
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('usa o formatador informado no valor final', () => {
    render(<AnimatedNumber value={0.42} format={(v) => `${Math.round(v * 100)}%`} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('formata com separador de milhar quando o formatador pede', () => {
    render(
      <AnimatedNumber value={5000} format={(v) => Math.round(v).toLocaleString('pt-BR')} />,
    );
    expect(screen.getByText('5.000')).toBeInTheDocument();
  });

  it('lida com zero sem cair no fallback de "sem valor"', () => {
    render(<AnimatedNumber value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('repassa a className recebida (tabular-nums vem de quem usa)', () => {
    render(<AnimatedNumber value={7} className="tabular-nums" />);
    expect(screen.getByText('7')).toHaveClass('tabular-nums');
  });
});
