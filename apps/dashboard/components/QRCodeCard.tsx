import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchQrCode, ClientApiError } from '@/lib/clientApi';
import type { WhatsAppSessionStatus } from '@/lib/clientApi';

/**
 * Reskin 2026-08-07 (Design System, tela Configurações) — o mockup desenha o
 * QR como um retângulo 96×96 dentro de um cartão bem compacto (lado a lado
 * com o cartão de resumo da sessão). 96px reproduziria o mockup à risca, mas
 * arriscaria um QR real pouco legível pela câmera do celular (o mockup é só
 * um placeholder hachurado, não um QR de verdade) — mantido em 128px, ainda
 * bem mais compacto que os 220px de antes, sem comprometer a leitura.
 */
const QR_SIZE_PX = 128;

/** Mesmo intervalo do poller SSE do BFF (`SSE_POLL_INTERVAL_MS`, Fase 3) — não há necessidade de um valor diferente aqui; mantém o mesmo "ritmo" de atualização percebido pelo usuário em toda a tela. */
const QR_POLL_INTERVAL_MS = 2000;

/** Milestone 6, Bloco M6E-1 (USER_JOURNEY.md §3.4): passo a passo explícito ao lado do QR — antes era uma única frase corrida. */
const CONNECT_STEPS = [
  'Abra o WhatsApp no seu celular',
  'Toque em Aparelhos conectados → Conectar aparelho',
  'Aponte a câmera para o QR Code ao lado',
];

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
 * primeiro QR) — tratado como "aguardando" (Skeleton, Milestone 6 M6E-1),
 * não como erro para o usuário.
 */
export default function QRCodeCard({ sessionName, status }: QRCodeCardProps): JSX.Element | null {
  const [qrCode, setQrCode] = useState<string | null>(null);
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
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ClientApiError && error.status === 409) {
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
    <div className="rounded-lg border border-border bg-card p-[18px]">
      <h2 className="mb-3 text-[13.5px] font-semibold text-foreground">Reconectar via QR Code</h2>
      <div className="flex items-start gap-3.5">
        <div className="shrink-0">
          {qrCode ? (
            <QRCodeSVG value={qrCode} size={QR_SIZE_PX} />
          ) : errorMessage ? (
            <div
              className="flex items-center justify-center rounded-[10px] bg-muted text-center text-xs text-muted-foreground"
              style={{ width: QR_SIZE_PX, height: QR_SIZE_PX }}
            >
              {errorMessage}
            </div>
          ) : (
            <Skeleton
              className="rounded-[10px]"
              style={{ width: QR_SIZE_PX, height: QR_SIZE_PX }}
            />
          )}
        </div>
        <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-foreground-secondary">
          {CONNECT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
