import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchQrCode, ClientApiError } from '@/lib/clientApi';
import type { WhatsAppSessionStatus } from '@/lib/clientApi';

/** Mesmo intervalo do poller SSE do BFF (`SSE_POLL_INTERVAL_MS`, Fase 3) — não há necessidade de um valor diferente aqui; mantém o mesmo "ritmo" de atualização percebido pelo usuário em toda a tela. */
const QR_POLL_INTERVAL_MS = 2000;

interface QRCodeCardProps {
  sessionName: string;
  status: WhatsAppSessionStatus;
}

/**
 * Exibe o QR Code para pareamento (M2, Fase 4 — UI-2). `getQRCode()`
 * (`apps/api`) devolve a string CRUA que o Baileys gera (`update.qr`), não
 * uma imagem pronta — ver auto-auditoria da entrega para a decisão de
 * renderizar essa string como QR Code no CLIENTE, via `qrcode.react`
 * (biblioteca nova, adicionada nesta fase), em vez de gerar uma imagem no
 * servidor: mantém o BFF (`pages/api/sessions/:sessionName/qrcode.ts`) como
 * um proxy fino sem nenhuma lógica de geração de imagem.
 *
 * Faz seu PRÓPRIO polling (`fetchQrCode` a cada ~2s), independente do SSE
 * de status (`useSessionDetail`): o payload do QR Code não faz parte do DTO
 * de status (`WhatsAppSessionDetails`) — é uma leitura separada
 * (`GET .../qrcode`), e o valor muda periodicamente enquanto o Baileys
 * aguarda o pareamento. Só poll quando `status === 'connecting'` (única
 * fase em que um QR pode existir) — para automaticamente fora disso.
 *
 * `409 qr_code_not_available` (`WhatsAppQRCodeNotAvailableError`) é um
 * estado NORMAL logo após iniciar a conexão (o Baileys ainda não gerou o
 * primeiro QR) — tratado como "aguardando", não como erro para o usuário.
 */
export default function QRCodeCard({ sessionName, status }: QRCodeCardProps): JSX.Element | null {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'connecting') {
      setQrCode(null);
      return;
    }

    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const { qrCode: value } = await fetchQrCode(sessionName);
        if (cancelled) return;
        setQrCode(value);
        setWaiting(false);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ClientApiError && error.status === 409) {
          setWaiting(true);
          return;
        }
        setErrorMessage('Falha ao carregar o QR Code.');
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), QR_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionName, status]);

  if (status !== 'connecting') {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-700">Escaneie para conectar</p>
      {qrCode ? (
        <QRCodeSVG value={qrCode} size={220} />
      ) : (
        <div className="flex h-[220px] w-[220px] items-center justify-center rounded-md bg-gray-100 text-sm text-gray-500">
          {errorMessage ?? (waiting ? 'Gerando QR Code…' : 'Carregando…')}
        </div>
      )}
      <p className="max-w-xs text-center text-xs text-gray-500">
        No WhatsApp do celular: Aparelhos conectados → Conectar aparelho → aponte a câmera para este código.
      </p>
    </div>
  );
}
