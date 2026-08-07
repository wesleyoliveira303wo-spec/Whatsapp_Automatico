import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Zap, UserCheck, MessageCircle } from 'lucide-react';
import LoginForm from '@/components/LoginForm';
import FrancisLogo from '@/components/brand/FrancisLogo';
import LoginChatPreview from '@/components/brand/LoginChatPreview';
import { requirePageSession } from '@/lib/auth';
import { BRAND, pageTitle } from '@/lib/brand';

/**
 * Página de login (M2, Fase 4). Guard INVERTIDO: sessão válida no cookie
 * redireciona para `/`.
 *
 * Milestone 6, Bloco M6F (revisão de Product Design, ADR #72): layout de
 * tela dividida 40/60 — painel de marca à esquerda (só desktop) com marca em
 * destaque, headline comercial, mockup de conversa (comunica IA + WhatsApp +
 * atendimento) e benefícios; formulário num card premium à direita sobre
 * fundo suave. Toda a marca vem de `lib/brand.ts`. Mobile: só o card, com
 * marca compacta no topo.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = requirePageSession(context);
  if (session) {
    return { redirect: { destination: '/', permanent: false } };
  }
  return { props: {} };
};

const HEADLINE = 'Nenhum cliente sem resposta.';
const SUBCOPY =
  'A IA do Francis atende na hora, qualifica o lead e chama você só quando realmente precisa.';

const BENEFITS = [
  { icon: Zap, text: 'Atende na hora, de dia e de noite' },
  { icon: UserCheck, text: 'Passa pra você nos momentos que importam' },
  { icon: MessageCircle, text: 'Tudo dentro do seu próprio WhatsApp' },
];

export default function LoginPage(): JSX.Element {
  return (
    <div className="flex min-h-screen">
      <Head>
        <title>{pageTitle('Entrar')}</title>
      </Head>

      {/* Painel de marca — só desktop, ~40% */}
      <aside className="hidden w-2/5 flex-col justify-between overflow-y-auto bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
            <FrancisLogo size={30} />
          </div>
          <div className="leading-tight">
            <p className="text-xl font-semibold">{BRAND.name}</p>
            <p className="mt-0.5 text-xs text-primary-foreground/70">{BRAND.tagline}</p>
          </div>
        </div>

        <div className="flex flex-col gap-7 py-8">
          <div>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">{HEADLINE}</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-primary-foreground/80">
              {SUBCOPY}
            </p>
          </div>
          <LoginChatPreview />
        </div>

        <ul className="flex flex-col gap-3.5">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-sm text-primary-foreground/90">{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Formulário — ~60% */}
      <main className="flex flex-1 items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          {/* Marca compacta — só mobile */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <FrancisLogo size={40} />
            <span className="text-lg font-medium text-foreground">{BRAND.name}</span>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-border bg-card p-8 shadow-lg duration-500 sm:p-9">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
