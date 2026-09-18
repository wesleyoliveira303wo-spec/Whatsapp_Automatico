# Anatomia de uma tela de listagem

> Nasceu da revisão da aba **Disparos** (2026-09-12), quando o fundador
> apontou que "Para contatos" e "Para grupos" pareciam produtos diferentes.
> A causa não foi falta de capricho: uma tela cresceu em seis rodadas e a
> outra nasceu semana passada copiando só o essencial. Estas regras existem
> para a próxima tela nascer inteira — e valem para Conversas, Contatos,
> Pipeline e o que vier depois.

## 1. A ordem é sempre a mesma

Toda tela que lista coisas tem, de cima para baixo:

1. **Título + uma frase** dizendo para que serve. Uma frase, não um parágrafo.
2. **Faixa de números** — no máximo quatro.
3. **Barra de ferramentas** — busca, filtro, ordenação e a ação principal,
   nesta ordem, na mesma linha.
4. **A lista** — tabela de verdade (`<table>`), nunca `div` imitando grade.
5. **Rodapé de contagem** — "Mostrando 6 de 41 disparos", com as páginas
   quando houver mais de uma.

Quem quiser uma variação precisa justificar; ausência de justificativa é
sinal de que a tela nasceu pela metade.

## 2. Quatro números, nunca cinco

O quinto indicador sempre parece importante e nunca é. Se um número novo
merece a tela, ele **substitui** um dos quatro. Cada número traz unidade e
recorte ("nesta sessão", "últimos 30 dias") — número sem recorte mente.

Número que ainda não existe mostra "—", nunca zero. "0 respostas" e "ainda
não medimos" parecem iguais na tela e significam coisas opostas.

## 3. Nada de coluna lateral repetindo o topo

A versão antiga de Disparos mostrava o mesmo dado duas vezes: quatro cartões
no topo e dois na direita. Ou o dado é importante e fica no topo, ou não é e
sai da tela. Coluna lateral só se carregar **outra** informação — tipicamente
"o que precisa da sua ação agora".

## 4. Um vocabulário por área, escolhido antes de escrever a tela

Disparos chamava a mesma coisa de "campanha" de um lado e "disparo" do outro,
e o menu dizia uma terceira coisa. O nome do item no menu, o título da página
e o substantivo dentro da tela são **a mesma palavra**.

Ação mantém o nome do começo ao fim: o botão "Novo disparo" abre "Novo
disparo" e o aviso diz "Disparo criado".

## 5. Cor só com significado

Verde = ação principal e sucesso. Âmbar = atenção/pausado. Vermelho = falha,
cancelado, destrutivo. Nada de cor decorativa: se a cor não muda o que a
pessoa entende, ela não entra.

## 6. Peça repetida vira componente compartilhado

Esta é a regra que impede a próxima divergência. Faixa de números, barra de
ferramentas, paginação e a mecânica de busca/filtro/ordenação vivem em
`components/broadcasts/` e `hooks/useBroadcastListControls.ts`. Uma tela nova
declara três funções (onde buscar, como filtrar, como comparar) e herda o
comportamento inteiro.

Duas telas irmãs com o mesmo comportamento escrito duas vezes é dívida, não
flexibilidade — elas divergem sozinhas, sem ninguém decidir isso.

## 7. Acessibilidade não é acabamento

Checado a cada tela: caixa de seleção e campo com nome acessível; menu com
`aria-haspopup`/`aria-expanded`, itens com papel de menu e Escape fechando;
ícone decorativo com `aria-hidden`; foco visível; e o gatilho do filtro
**mostrando** o filtro ativo em vez de dizer sempre "Filtros".

## 8. Busca, filtro e página vão para a URL

Resolvido em 2026-09-17 — era a pendência registrada aqui desde a revisão.
Cada controle tem seu parâmetro (`q`, `status`, `sort`, `page`), e eles
convivem com o `?tab=` da página sem se atropelarem. Consequências práticas:
um link já filtrado pode ser compartilhado, e o F5 não perde a escolha.

Três regras que a implementação carrega e valem para a próxima tela:

- **Só aparece na URL o que saiu do padrão.** A URL de uma tela intocada
  continua limpa.
- **Valor inválido cai no padrão.** `?status=banana` mostra a lista inteira;
  nunca uma tela vazia sem explicação. O mesmo para uma página que não existe
  mais: mostra a última.
- **A troca de endereço é `replace` raso.** Não recarrega dados e não empilha
  histórico — senão o "voltar" do navegador sairia da tela letra por letra.

Quem usa o hook compartilhado (`useBroadcastListControls`) ganha isso sem
escrever nada, só declarando os valores aceitos de filtro e ordenação.

## 9. Nunca rolagem horizontal (2026-09-17)

Pedido permanente do fundador: o app só rola na vertical, em qualquer tela.
Medido na varredura desta data, as causas se repetem — confira estas antes de
dar uma tela por pronta:

- **Item `flex-1` sem `min-w-0`.** O `min-width:auto` do flexbox deixa o
  conteúdo alargar a coluna. Todo `flex-1` que contém texto ou tabela leva
  `min-w-0`.
- **Tabela com todas as colunas sempre visíveis.** Use
  `components/broadcasts/responsiveColumns.ts`: nome, status e ações ficam; o
  resto aparece por breakpoint. Dado que some da tabela no celular desce para
  baixo do nome, nunca desaparece do produto.
- **Largura fixa em px** (colunas de quadro, `min-w-[…]`, `<select>` nativo).
  Prefira grade responsiva; no celular, `w-full`.
- **Palavra sem espaço** (nome de arquivo, UUID, ação crua): `break-all` ou
  `[overflow-wrap:anywhere]` — `break-words` sozinho não reduz a largura
  mínima de uma célula de tabela.

Verificação: rode, em cada tela, um detector que liste contêineres com
`scrollWidth > clientWidth` e `overflow-x` auto/scroll, a 375px e a 1.280px.
Captura de tela do painel embutido sai reduzida e esconde o problema.
