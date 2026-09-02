import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { BRAND, pageTitle } from '@/lib/brand';
import type { LegalDoc } from '@/lib/legalContent';
import LandingFooter from '@/components/landing/LandingFooter';

/**
 * T6 (Lançamento suave) — casca das páginas legais (`/termos`,
 * `/privacidade`). Mesma casca ESCURA da landing/login (a jornada é um
 * produto só), reaproveita o `LandingFooter`.
 */
export default function LegalPageLayout({
  doc,
  currentYear,
}: {
  doc: LegalDoc;
  currentYear: number;
}): JSX.Element {
  return (
    <div className="dark min-h-screen bg-background text-foreground antialiased [color-scheme:dark]">
      <Head>
        <title>{pageTitle(doc.title)}</title>
        <meta name="description" content={doc.intro} />
        <meta name="robots" content="noindex" />
      </Head>

      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para {BRAND.name}
        </Link>

        <h1 className="mt-8 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-tight">
          {doc.title}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">Última atualização: {doc.updatedAt}</p>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{doc.intro}</p>

        <div className="mt-10 flex flex-col gap-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-semibold">{section.heading}</h2>
              <div className="mt-2 flex flex-col gap-2.5">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <LandingFooter year={currentYear} />
    </div>
  );
}
