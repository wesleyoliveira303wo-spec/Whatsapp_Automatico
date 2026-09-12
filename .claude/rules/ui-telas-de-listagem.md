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

## 8. Pendência conhecida (não é esquecimento)

Busca, filtro e página ainda não vão para a URL — hoje só a aba vai
(`?tab=`). A consequência: não dá para mandar a alguém um link já filtrado, e
o F5 perde o filtro. Vale corrigir quando alguma tela precisar de link
compartilhável; está anotado para não ser redescoberto como novidade.
