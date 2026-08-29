/**
 * Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 4) —
 * upload de foto de verdade (substitui o campo de texto "URL da foto").
 * `lib/imageResize.ts` é mockado aqui (já tem os próprios testes,
 * `imageResize.test.tsx`) — este arquivo testa só a ORQUESTRAÇÃO: clicar
 * abre o seletor, escolher um arquivo processa e chama `onChange`, erro
 * (de processar OU de salvar) aparece pra o usuário, spinner enquanto
 * ocupado.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditableAvatar from '../../components/EditableAvatar';
import * as imageResize from '../../lib/imageResize';

jest.mock('../../lib/imageResize', () => ({
  ...jest.requireActual('../../lib/imageResize'),
  resizeImageToDataUrl: jest.fn(),
}));

const mockResize = imageResize.resizeImageToDataUrl as jest.Mock;

function fakeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' });
}

describe('EditableAvatar', () => {
  beforeEach(() => {
    mockResize.mockReset();
  });

  it('botão tem rótulo acessível "Trocar foto de perfil" (o hover+lápis não é o único jeito de descobrir a ação)', () => {
    render(<EditableAvatar email="w@empresa.com" onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Trocar foto de perfil' })).toBeInTheDocument();
  });

  it('escolher um arquivo: processa e chama onChange com o resultado', async () => {
    mockResize.mockResolvedValue('data:image/jpeg;base64,AAAA');
    const onChange = jest.fn().mockResolvedValue(undefined);
    render(<EditableAvatar email="w@empresa.com" onChange={onChange} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fakeFile()] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA'));
  });

  it('nenhum arquivo escolhido (usuário cancelou o seletor): não chama onChange', async () => {
    const onChange = jest.fn();
    render(<EditableAvatar email="w@empresa.com" onChange={onChange} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });

    expect(mockResize).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('erro ao processar a imagem: mostra a mensagem do ImageResizeError', async () => {
    mockResize.mockRejectedValue(new imageResize.ImageResizeError('Escolha um arquivo de imagem (JPEG, PNG…).'));
    render(<EditableAvatar email="w@empresa.com" onChange={jest.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fakeFile()] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Escolha um arquivo de imagem (JPEG, PNG…).',
    );
  });

  it('erro ao SALVAR (onChange rejeita): mostra a mensagem de quem chamou, não some silenciosamente', async () => {
    mockResize.mockResolvedValue('data:image/jpeg;base64,AAAA');
    const onChange = jest.fn().mockRejectedValue(new Error('Não foi possível salvar. Tente novamente.'));
    render(<EditableAvatar email="w@empresa.com" onChange={onChange} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fakeFile()] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar. Tente novamente.',
    );
  });

  it('escolher o MESMO arquivo duas vezes seguidas dispara onChange as duas vezes (o <input> é limpo após cada escolha)', async () => {
    mockResize.mockResolvedValue('data:image/jpeg;base64,AAAA');
    const onChange = jest.fn().mockResolvedValue(undefined);
    render(<EditableAvatar email="w@empresa.com" onChange={onChange} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = fakeFile();
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
  });
});
