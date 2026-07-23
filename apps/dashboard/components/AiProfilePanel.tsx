import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { fetchAiProfile, saveAiProfile, ClientApiError } from '@/lib/clientApi';

/**
 * Teto de caracteres — espelha `MAX_PROFILE_CONTENT_LENGTH` da API
 * (`AiBusinessProfileService`). Duplicado aqui de propósito (a UI não importa
 * código do backend), só para dar feedback de contador/erro antes de enviar; a
 * validação REAL é sempre a da API.
 */
const MAX_CONTENT_LENGTH = 20_000;

/** Texto-guia mostrado no textarea vazio — ajuda o dono do negócio a saber o que escrever. */
const PLACEHOLDER = [
  'Descreva sua empresa para a IA responder os clientes. Por exemplo:',
  '',
  '- Nome: Salão da Maria',
  '- O que fazemos: cortes, escova, coloração e manicure',
  '- Preços: corte R$ 50, escova R$ 40, coloração a partir de R$ 120',
  '- Horário: terça a sábado, das 9h às 18h',
  '- Endereço: Rua das Flores, 123',
  '- Formas de pagamento: dinheiro, Pix e cartão',
  '- Observações: agendamento só por WhatsApp; não atendemos aos domingos',
].join('\n');

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'validation_error') return `O texto não pode passar de ${MAX_CONTENT_LENGTH.toLocaleString('pt-BR')} caracteres.`;
    if (code === 'tenant_not_found') return 'Empresa não encontrada.';
    if (error.status === 403) return 'Seu cargo não permite editar o Cérebro da IA (apenas administrador ou dono).';
    if (error.status === 401) return 'Sessão expirada. Entre novamente.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

/**
 * Painel do "Cérebro da IA" (Base de Conhecimento, Nível 1). Uma caixa de texto
 * livre onde o dono do negócio descreve a empresa; esse texto é anexado ao
 * prompt da IA a cada resposta. Carrega o texto atual, permite editar e salvar.
 * Toda regra (tamanho, permissão) vive na API — este painel só traduz os erros.
 */
export default function AiProfilePanel(): JSX.Element {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const { profile } = await fetchAiProfile();
      setContent(profile?.content ?? '');
      setSavedContent(profile?.content ?? '');
      setUpdatedAt(profile?.updatedAt ?? null);
    } catch (error) {
      setLoadError(errorMessageFor(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = content !== savedContent;
  const tooLong = content.length > MAX_CONTENT_LENGTH;

  const handleSubmit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      setSaving(true);
      setSaveError(null);
      setSavedNotice(false);
      try {
        const { profile } = await saveAiProfile(content);
        setSavedContent(profile.content);
        setContent(profile.content);
        setUpdatedAt(profile.updatedAt);
        setSavedNotice(true);
      } catch (error) {
        setSaveError(errorMessageFor(error));
      } finally {
        setSaving(false);
      }
    },
    [content],
  );

  if (loading) {
    return <p className="text-gray-500">Carregando…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-red-600">{loadError}</p>
        <button type="button" onClick={() => void load()} className="rounded bg-gray-200 px-3 py-1 text-gray-800 hover:bg-gray-300">
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-600">
        Escreva aqui tudo o que a IA precisa saber para responder seus clientes: quem é a empresa, o que você vende, preços,
        horários e regras de atendimento. A IA usa este texto em todas as respostas. Se algo não estiver aqui, ela não inventa —
        encaminha para um atendente humano.
      </p>

      <textarea
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setSavedNotice(false);
        }}
        placeholder={PLACEHOLDER}
        rows={16}
        className="w-full rounded-md border border-gray-300 p-3 font-mono text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className={tooLong ? 'text-red-600' : undefined}>
          {content.length.toLocaleString('pt-BR')} / {MAX_CONTENT_LENGTH.toLocaleString('pt-BR')} caracteres
        </span>
        {updatedAt && <span>Última atualização: {new Date(updatedAt).toLocaleString('pt-BR')}</span>}
      </div>

      {saveError && <p className="text-red-600">{saveError}</p>}
      {savedNotice && !dirty && <p className="text-green-600">Salvo! A IA já vai usar essas informações nas próximas respostas.</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || tooLong || !dirty}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {dirty && !saving && <span className="text-xs text-gray-500">Há alterações não salvas.</span>}
      </div>
    </form>
  );
}
