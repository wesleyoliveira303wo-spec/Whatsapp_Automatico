/**
 * Milestone 6, Bloco M6D-3 — teste do primitivo `Skeleton`.
 */
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Skeleton } from '../../../components/ui/skeleton';

describe('Skeleton (Milestone 6, Bloco M6D-1)', () => {
  it('renderiza com a animação de pulso e aceita formato via className', () => {
    const { container } = render(<Skeleton className="h-4 w-32" data-testid="sk" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('animate-pulse');
    expect(el).toHaveClass('h-4');
    expect(el).toHaveClass('w-32');
  });
});
