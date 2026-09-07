# Rastreador de issues: GitHub

As issues e specs deste repositório vivem como **GitHub Issues**
(`wesleyoliveira303wo-spec/Whatsapp_Automatico`). Use o CLI `gh` para todas as
operações — ele infere o repositório a partir de `git remote -v` quando rodado
dentro do clone.

## Convenções

- **Criar uma issue**: `gh issue create --title "..." --body "..."`. Use um
  heredoc para corpos com várias linhas.
- **Ler uma issue**: `gh issue view <número> --comments`.
- **Listar issues**:
  `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`
  com os filtros `--label` e `--state` apropriados.
- **Comentar numa issue**: `gh issue comment <número> --body "..."`
- **Aplicar / remover labels**: `gh issue edit <número> --add-label "..."` /
  `--remove-label "..."`
- **Fechar**: `gh issue close <número> --comment "..."`

## Pull requests como superfície de triagem

**PRs como superfície de pedidos: não.** _(Mude para `sim` se este
repositório tratar PRs externos como pedidos de funcionalidade; a skill
`/triage` lê esta flag.)_

Quando estiver em `sim`, os PRs passam pelas mesmas labels e estados das
issues, usando os equivalentes `gh pr` (`gh pr view`, `gh pr diff`,
`gh pr list`, `gh pr comment`, `gh pr edit --add-label`, `gh pr close`). O
GitHub compartilha um único espaço de numeração entre issues e PRs, então um
`#42` isolado pode ser um dos dois: resolva com `gh pr view 42` e caia para
`gh issue view 42`.

## Quando uma skill disser "publicar no rastreador de issues"

Criar uma GitHub Issue.

## Quando uma skill disser "buscar o ticket relevante"

Rodar `gh issue view <número> --comments`.
