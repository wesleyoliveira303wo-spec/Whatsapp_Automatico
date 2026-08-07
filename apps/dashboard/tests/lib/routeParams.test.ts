import { requireStringParam } from '../../lib/routeParams';
import { createFakeRes } from '../testDoubles';

describe('requireStringParam', () => {
  it('devolve o valor quando é uma string não-vazia', () => {
    const res = createFakeRes();

    expect(requireStringParam('vendas', 'sessionName', res)).toBe('vendas');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responde 400 e devolve undefined quando o valor está ausente', () => {
    const res = createFakeRes();

    expect(requireStringParam(undefined, 'sessionName', res)).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'invalid_params',
      message: 'sessionName não pode ser vazio',
    });
  });

  it('responde 400 quando o valor é uma string vazia/só espaço', () => {
    const res = createFakeRes();

    expect(requireStringParam('   ', 'sessionName', res)).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responde 400 quando o valor é um array (rota catch-all, não esperado aqui)', () => {
    const res = createFakeRes();

    expect(requireStringParam(['a', 'b'], 'sessionName', res)).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
