import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import LoginForm from '@/components/LoginForm';
import FrancisLogo from '@/components/brand/FrancisLogo';
import AuthMarketingPanel from '@/components/brand/AuthMarketingPanel';
import AuthFooter from '@/components/brand/AuthFooter';
import { requirePageSession } from '@/lib/auth';
import { BRAND, pageTitle } from '@/lib/brand';

/**
 * Página de login (M2, Fase 4). Guard INVERTIDO: sessão válida no cookie
 * redireciona para `/`.
 *
 * RECONSTRUÇÃO 2026-08-28 (pedido explícito do fundador, imagem de
 * referência anexada) — substitui o layout do Milestone 6/Bloco M6F (painel
 * verde sólido + card claro) por um split-screen ESCURO fixo, à parte do
 * tema claro/escuro do resto do app: `className="dark"` no wrapper raiz
 * aplica só AQUI os tokens de `.dark` de `globals.css` (mesmo mecanismo de
 * cascata de CSS custom properties que o toggle de tema usa em `<html>`,
 * só que escopado a esta subárvore) — nunca mexe em `localStorage`/na
 * preferência do usuário para o resto do app. Os tokens escuros já
 * existentes (fundo azul-marinho quase preto, verde vibrante como
 * `--primary`, bordas azul-acinzentadas) bateram com a referência sem
 * precisar de nenhuma cor nova — só reaproveitados.
 *
 * O painel de marca (logo/badge/headline/benefícios/mockup) mora em
 * `AuthMarketingPanel` — compartilhado com `pages/register.tsx` (pedido do
 * fundador: "a aba de registro ainda é a antiga, use a mesma regra nela").
 *
 * 2ª rodada (2026-08-28, mesmo pedido) — card do formulário reduzido
 * (padding/gaps menores, `LoginForm` mais compacto): numa viewport de
 * altura comum de notebook o card ficava mais alto que a tela e o fim
 * (Google/Microsoft) saía cortado por baixo da dobra.
 *
 * 3ª rodada (2026-08-28, mesmo pedido: "suba o posicionamento" do card e do
 * mockup do dashboard) — `lg:-translate-y-3` no card: a centralização
 * vertical pura (`items-center`) deixava o card visualmente "baixo demais"
 * na tela; um deslocamento fixo pequeno pra cima, só no desktop.
 *
 * 4ª rodada (2026-08-28, achado real do fundador) — o `overflow-y-auto`
 * que a 2ª rodada pôs no `<main>` criou uma barra de rolagem PRÓPRIA bem na
 * borda entre os dois painéis (feio, parecia "quebrado") — e ainda por
 * cima impedia a PÁGINA de crescer o suficiente pra rolar até o mockup do
 * dashboard (que vive no `<aside>`, fora do `<main>`), deixando-o cortado
 * de verdade em telas baixas. Removido: agora é a PÁGINA inteira que rola
 * (scrollbar única, na borda direita de verdade da janela) quando o
 * conteúdo não cabe — nunca mais um scroll isolado no meio da tela.
 *
 * 5ª rodada (2026-08-28, mesmo pedido: "não cortado", card sempre
 * centralizado) — a tentativa inicial (`lg:items-start` na linha +
 * `lg:min-h-screen` no `<main>`) evitava o vão vazio, mas trocava o
 * problema por outro: como `<aside>` (com o mockup) é bem mais alto que
 * `<main>` (só o card), ao rolar a PÁGINA o `<main>` "acabava" antes do
 * `<aside>` — sobrava um vão em branco à direita enquanto o painel
 * esquerdo ainda tinha conteúdo pra mostrar. Corrigido com `position:
 * sticky`: a linha volta ao `stretch` padrão (`<main>` fica da MESMA
 * altura que `<aside>`, sem `items-start`/`min-h-screen`), e o cartão
 * dentro do `<main>` fica `sticky top-1/2 -translate-y-1/2` — ele gruda
 * centralizado na viewport durante TODA a extensão da rolagem da página
 * (já que a caixa do `<main>` tem exatamente a altura da do `<aside>`),
 * nunca sai de vista, nunca aparece cortado, e não cria nenhuma barra de
 * rolagem própria (sticky não rola sozinho, só a página).
 */
interface LoginPageProps {
  /** Calculado no servidor (não `new Date()` no componente) — evita um mismatch de hidratação bem no instante da virada do ano, por menor que seja a chance. */
  currentYear: number;
}

export const getServerSideProps: GetServerSideProps<LoginPageProps> = async (context) => {
  const session = requirePageSession(context);
  if (session) {
    return { redirect: { destination: '/app', permanent: false } };
  }
  return { props: { currentYear: new Date().getFullYear() } };
};

export default function LoginPage({ currentYear }: LoginPageProps): JSX.Element {
  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
      <Head>
        <title>{pageTitle('Entrar')}</title>
      </Head>

      <div className="flex flex-1 flex-col lg:flex-row">
        <AuthMarketingPanel />

        {/* Formulário — sem `overflow-y-auto` aqui (ver docstring, 4ª
            rodada): numa viewport baixa é a PÁGINA que rola, nunca só este
            painel. Linha SEM `items-start` (5ª rodada): `<main>` fica
            `stretch` (padrão), da MESMA altura que `<aside>` — e o card
            dentro dele usa `sticky` pra se manter centralizado na viewport
            durante toda a rolagem, sem depender de `<main>` ter a altura
            exata de uma tela. */}
        <main className="flex flex-1 items-center justify-center p-6 lg:block lg:px-12 lg:py-8">
          {/* 6ª rodada (achado real do fundador: vão vazio enorme à direita
              da tela) — `justify-center` do flex parou de valer quando
              `<main>` virou `lg:block` (pro `sticky` funcionar, 5ª rodada);
              sem isso o card, embora `w-full`, ficava colado à ESQUERDA de
              `<main>` (comportamento padrão de bloco), sobrando um vão à
              direita. `lg:mx-auto` devolve a centralização horizontal,
              agora via margem, não via flex. */}
          <div className="w-full max-w-[420px] lg:sticky lg:top-1/2 lg:mx-auto lg:-translate-y-1/2 lg:-mt-3">
            {/* Marca compacta — só mobile */}
            <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
              <FrancisLogo size={40} />
              <span className="text-lg font-semibold text-foreground">{BRAND.name}</span>
            </div>
            <div className="animate-in fade-in slide-in-from-bottom-2 rounded-[22px] border border-border bg-white/[0.015] p-7 duration-500 sm:p-8">
              <LoginForm />
            </div>
          </div>
        </main>
      </div>

      <AuthFooter currentYear={currentYear} />
    </div>
  );
}
