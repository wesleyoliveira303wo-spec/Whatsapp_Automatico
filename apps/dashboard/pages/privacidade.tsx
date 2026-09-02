import type { GetStaticProps } from 'next';

import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { PRIVACIDADE } from '@/lib/legalContent';

/**
 * `/privacidade` — Política de Privacidade (T6, Lançamento suave). Página
 * pública, estática, sem guard de sessão. Linkada do rodapé da landing.
 */
export const getStaticProps: GetStaticProps<{ currentYear: number }> = async () => ({
  props: { currentYear: new Date().getFullYear() },
});

export default function PrivacidadePage({ currentYear }: { currentYear: number }): JSX.Element {
  return <LegalPageLayout doc={PRIVACIDADE} currentYear={currentYear} />;
}
