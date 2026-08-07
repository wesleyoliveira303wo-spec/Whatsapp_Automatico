/**
 * Milestone 6, Bloco M6C-5 — testes do primitivo `Table`. Sem Radix — a
 * acessibilidade vem da semântica nativa do HTML (`<table>`), então o teste
 * verifica que a estrutura semântica correta é gerada.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '../../../components/ui/table';

describe('Table (Milestone 6, Bloco M6C-3)', () => {
  it('renderiza cabeçalho, linhas e células com semântica de tabela', () => {
    render(
      <Table>
        <TableCaption>Sessões conectadas</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Sessão 1</TableCell>
            <TableCell>Conectada</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Sessão 1' })).toBeInTheDocument();
    expect(screen.getByText('Sessões conectadas')).toBeInTheDocument();
  });
});
