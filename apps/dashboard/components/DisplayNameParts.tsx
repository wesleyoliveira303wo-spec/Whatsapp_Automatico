interface DisplayNamePartsProps {
  primary: string;
  secondary?: string;
}

/**
 * Renderiza um nome de exibição de contato (`formatContactDisplayNameParts`/
 * `formatPersonLabelParts`, `lib/formatters.ts`) preservando a distinção
 * visual entre as duas partes — pedido do fundador (2026-08-21): quando o
 * contato NÃO está salvo, o telefone (`primary`, obrigatório) some junto do
 * apelido do WhatsApp (`secondary`), mas os dois têm o MESMO peso visual, o
 * que confunde qual dado é o principal.
 *
 * `secondary` sai em `0.8em` (80% do tamanho herdado do elemento pai — nunca
 * um valor fixo em px, para funcionar igual em qualquer tela que use este
 * componente, cada uma com seu próprio tamanho de fonte) e em
 * `text-muted-foreground` — o telefone continua no tamanho/cor que o
 * elemento pai já define.
 *
 * ONDA 1 DO REDESIGN (2026-08-22) — a distinção original (`0.7em` +
 * `text-muted-foreground/60`) estava certa na INTENÇÃO e exagerada no GRAU:
 * `--muted-foreground` (#5C6B64) sobre `--panel` (#FAFAF9) já rende ~5,5:1
 * de contraste, mas a 60% de opacidade a cor efetiva cai para ~2,2:1 —
 * abaixo do mínimo AA de 4,5:1 que `PRODUCT_PRINCIPLES.md` §7 exige. Na tela
 * real o nome do contato ficava quase invisível em TODA lista do produto
 * (Conversas, Contatos, Pipeline, Campanhas). A opacidade extra saiu e o
 * tamanho subiu um degrau; a hierarquia continua evidente, agora legível.
 *
 * Sem elemento de bloco próprio (`<>...</>`): quem chama mantém o
 * `<p>`/`<span>`/`<h2>` com as classes de tamanho/peso/truncate de sempre, e
 * este componente só entra como filho.
 */
export default function DisplayNameParts({
  primary,
  secondary,
}: DisplayNamePartsProps): JSX.Element {
  return (
    <>
      {/* `primary` também sai num `<span>` próprio (não como texto solto) —
          garante que cada parte é um nó independente, tanto para o CSS de
          `secondary` não "vazar" no texto principal quanto para testes
          conseguirem consultar cada parte isoladamente. */}
      <span>{primary}</span>
      {secondary && (
        <span className="ml-1 text-[0.8em] font-normal text-muted-foreground">{secondary}</span>
      )}
    </>
  );
}
