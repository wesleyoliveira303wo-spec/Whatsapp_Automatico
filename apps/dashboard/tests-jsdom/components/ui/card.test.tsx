/**
 * Milestone 6, Bloco M6C-5 — testes do primitivo `Card` (compound component).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../../components/ui/card';

describe('Card (Milestone 6, Bloco M6C-1)', () => {
  it('renderiza título, descrição e conteúdo', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Sessão conectada</CardTitle>
          <CardDescription>Última atividade há 2 minutos</CardDescription>
        </CardHeader>
        <CardContent>Conteúdo do cartão</CardContent>
        <CardFooter>Rodapé</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Sessão conectada')).toBeInTheDocument();
    expect(screen.getByText('Última atividade há 2 minutos')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo do cartão')).toBeInTheDocument();
    expect(screen.getByText('Rodapé')).toBeInTheDocument();
  });

  it('CardTitle renderiza como <h3>', () => {
    render(<CardTitle>Título</CardTitle>);
    expect(screen.getByRole('heading', { level: 3, name: 'Título' })).toBeInTheDocument();
  });
});
