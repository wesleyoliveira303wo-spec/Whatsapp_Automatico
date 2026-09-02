import type { GetStaticProps } from 'next';

import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { TERMOS } from '@/lib/legalContent';

/**
 * `/termos` — Termos de Uso (T6, Lançamento suave). Página pública,
 * estática, sem guard de sessão. Linkada do rodapé da landing.
 */
export const getStaticProps: GetStaticProps<{ currentYear: number }> = async () => ({
  props: { currentYear: new Date().getFullYear() },
});

export default function TermosPage({ currentYear }: { currentYear: number }): JSX.Element {
  return <LegalPageLayout doc={TERMOS} currentYear={currentYear} />;
}
