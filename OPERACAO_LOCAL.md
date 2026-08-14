# Operação local do Francis

Como rodar o Francis no seu computador Windows em modo de produção — os mesmos 5 containers que irão para uma VPS no futuro.

## Uso diário

Abra o **PowerShell** na pasta do projeto e use o script `francis`:

```bash
francis start
```

```bash
francis status
```

```bash
francis logs
```

```bash
francis stop
```

Depois de mudar código:

```bash
francis rebuild
```

Sem argumento, `francis` mostra a lista de comandos.

> Se preferir os comandos do Docker diretamente, todos equivalem a
> `docker compose -f docker-compose.prod.yml <comando>`.

## Onde acessar

| O quê           | Endereço                           |
| --------------- | ---------------------------------- |
| **Dashboard**   | http://localhost:3000              |
| API — liveness  | http://localhost:4000/health       |
| API — prontidão | http://localhost:4000/health/ready |

`/health/ready` é o diagnóstico rápido: mostra se Postgres e Redis estão respondendo e quantos jobs de IA estão na fila.

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "aiQueue": { "waiting": 0, "active": 0, "failed": 0, "delayed": 0 }
  }
}
```

`"status":"degraded"` significa que Postgres ou Redis caiu — comece por `francis logs`.

## Depois de reiniciar o Windows

**Nada.** Os containers usam `restart: unless-stopped`, então o Docker os sobe sozinho assim que inicia.

Para isso funcionar, o Docker Desktop precisa iniciar junto com o Windows — verifique uma vez em **Docker Desktop → Settings → General → "Start Docker Desktop when you sign in to your computer"**.

Depois do login no Windows, leva de 1 a 2 minutos até tudo estar no ar (o Docker sobe primeiro, os containers depois). Confira com `francis status`.

A única situação em que os containers **não** voltam sozinhos é se você tiver rodado `francis stop` antes — é o comportamento pretendido de `unless-stopped`: parada manual é respeitada.

## Como verificar o WhatsApp

A sessão reconecta **sozinha** quando a API sobe, sem QR Code. Para confirmar:

```bash
francis logs api
```

Procure por estas três linhas:

```
Restaurando sessões de WhatsApp conectadas
Sessão restaurada
Conexão Baileys estabelecida
```

Ou, pelo Dashboard: abra http://localhost:3000, entre no WhatsApp conectado e veja a bolinha de status verde.

**Teste real:** mande uma mensagem de outro celular para o número conectado e veja se aparece na tela de Conversas e se a IA responde.

## Por que o QR Code não é pedido de novo

As credenciais do Baileys ficam **cifradas no PostgreSQL** (tabela `tenant_credentials`), não em arquivo. Sobrevivem a restart de container, `down`/`up` e reboot do Windows.

Duas coisas destroem a sessão e forçam novo QR Code:

1. Apagar o volume do banco — `docker compose down -v` (**nunca use o `-v`**)
2. Trocar a variável `WHATSAPP_CREDENTIALS_MASTER_KEY` no `.env`

## Problemas comuns

**`francis start` diz que o Docker não está em execução**
Abra o Docker Desktop e espere o ícone da baleia ficar estável antes de tentar de novo.

**Dashboard não abre / conexão recusada**
Veja `francis status`. Se `dashboard` não estiver `Up`, rode `francis logs dashboard`.

**A IA parou de responder e aparece "Aguardando atendente"**
Provavelmente é cota do Gemini. O free tier do `gemini-3.5-flash` permite ~5 requisições por minuto; ao estourar, a API devolve `429` e o Francis escala para atendimento humano em vez de deixar o cliente sem resposta. Espera um minuto e volta ao normal. Para conferir:

```bash
francis logs worker
```

**Porta 3000 ou 4000 já em uso**
Você provavelmente tem um `npm run dev` aberto de antes. Feche-o — os containers e o modo de desenvolvimento não podem usar as mesmas portas ao mesmo tempo.

**Mudei o código e nada mudou**
`francis start` não reconstrói imagens. Use `francis rebuild`.

## Modo de desenvolvimento ainda funciona

O `docker-compose.yml` original e o `npm run dev` continuam intactos para quando você for programar. Os dois modos **compartilham o mesmo banco** (mesmo volume `pgdata`), então os dados são os mesmos — mas não rode os dois ao mesmo tempo (conflito de porta).

## O que muda quando for para uma VPS

Este ambiente foi montado para migrar sem retrabalho. O que muda:

| Item               | Local hoje        | Numa VPS                                     |
| ------------------ | ----------------- | -------------------------------------------- |
| Compose            | o mesmo arquivo   | o mesmo arquivo                              |
| Imagens            | as mesmas         | as mesmas                                    |
| `.env`             | o seu             | segredos novos, gerados no servidor          |
| Portas 3000/4000   | `127.0.0.1`       | `127.0.0.1` + Nginx na frente                |
| Portas 5432/6379   | `127.0.0.1`       | `127.0.0.1` (só por túnel SSH)               |
| Acesso             | `localhost`       | domínio com HTTPS                            |
| Dados              | volume `pgdata`   | migrar via `pg_dump`                         |
| Sessão do WhatsApp | vem junto no dump | precisa reescanear se o dump não for migrado |

O passo a passo completo está em [DEPLOY.md](DEPLOY.md).

## Backup (recomendado)

Seu banco tem as conversas **e** as credenciais do WhatsApp. Para gerar uma cópia:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U francis francis > backup.sql
```

Troque `francis` pelo valor de `POSTGRES_USER` e `POSTGRES_DB` do seu `.env`.
