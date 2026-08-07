/**
 * Milestone 6, Bloco M6C-5 — teste do primitivo `Select`. Escopo
 * deliberadamente conservador: verifica a renderização real (trigger,
 * placeholder, papel ARIA `combobox`) sem simular abrir o dropdown — a
 * interação de abrir/selecionar via Radix Select depende de APIs de ponteiro
 * (`hasPointerCapture`/`scrollIntoView`) que o jsdom não implementa por
 * padrão; testar isso com confiança pede `@testing-library/user-event` (não
 * instalado ainda) ou polyfills dedicados. Fica registrado como melhoria
 * futura quando o primeiro formulário real usar este componente (M6E+).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../../../components/ui/select';

describe('Select (Milestone 6, Bloco M6C-2)', () => {
  it('renderiza o trigger com o placeholder e papel combobox', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Selecione um status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bot">Bot respondendo</SelectItem>
          <SelectItem value="human">Atendimento humano</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByText('Selecione um status')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('mostra o valor default quando defaultValue é passado', () => {
    render(
      <Select defaultValue="bot">
        <SelectTrigger>
          <SelectValue placeholder="Selecione um status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bot">Bot respondendo</SelectItem>
          <SelectItem value="human">Atendimento humano</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByText('Bot respondendo')).toBeInTheDocument();
  });
});
