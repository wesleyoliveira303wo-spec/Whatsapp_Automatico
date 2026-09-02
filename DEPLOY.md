# DEPLOY — Produção na Hostinger VPS (beta fechado)

> **Alternativa de custo zero (T9):** para subir numa VM Oracle Cloud Always Free,
> com Caddy e HTTPS automático em `<ip>.sslip.io` (sem domínio, sem VPS paga),
> use **[`DEPLOY_ORACLE.md`](DEPLOY_ORACLE.md)** — ou rode o assistente
> `bash scripts/deploy-t9-wizard.sh`, que gera o `.env` e guia o passo a passo.

Runbook completo do primeiro deploy. Arquitetura aprovada: **1 VPS Hostinger KVM 2**, Docker Compose com 5 containers, Nginx no host com Let's Encrypt.

> **Convenção usada em todo o documento:**
> 🖥️ = executar **no seu computador (Windows)** · ☁️ = executar **dentro da VPS** · 📦 = executar **dentro de um container**

Substitua em todos os comandos:

- `SEUDOMINIO.com` → seu domínio real
- `SEU.IP.DA.VPS` → o IPv4 que a Hostinger te der

---

## Arquitetura

```
INTERNET
   │  app.SEUDOMINIO.com ─┐
   │  api.SEUDOMINIO.com ─┤  (DNS: dois registros A → IP da VPS)
   ▼                      │
NGINX (host, :80/:443, TLS Let's Encrypt)
   ├──> 127.0.0.1:3000 ──> container dashboard (Next.js)
   └──> 127.0.0.1:4000 ──> container api (Express + Baileys)

   [rede interna do Docker — sem acesso externo]
   dashboard ──> api (http://api:4000)
   api ──┬──> postgres:5432   (volume pgdata)
         └──> redis:6379      (volume redisdata)
   worker ──> postgres + redis   (nunca fala com a api via HTTP)
```

**Por que a sessão do WhatsApp sobrevive a reboots:** as credenciais do Baileys não ficam em disco — ficam cifradas (AES-256-GCM) na tabela `tenant_credentials` do Postgres. O que precisa sobreviver é o volume `pgdata` e a variável `WHATSAPP_CREDENTIALS_MASTER_KEY`. Perder qualquer um dos dois = escanear QR Code de novo em todas as sessões.

---

## ETAPA 1 — Contratar a VPS

No [hostinger.com/vps-hosting](https://www.hostinger.com/vps-hosting), contrate o **KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe).

Ao configurar o servidor, na escolha de sistema operacional, **selecione o template `Ubuntu 24.04 com Docker`** (em hPanel → VPS → OS & Panel → Operating System → Application → Docker). Isso já entrega Docker Engine + Docker Compose instalados, e pula as ETAPAS 7 e 8.

Anote o **IPv4** e a **senha de root** que a Hostinger exibir.

## ETAPA 2 — Gerar chave SSH e acessar

🖥️ No seu computador (PowerShell), se você ainda não tem uma chave:

```bash
ssh-keygen -t ed25519 -C "deploy-francis"
```

Aceite o caminho padrão (`C:\Users\SEU_USUARIO\.ssh\id_ed25519`) e defina uma senha para a chave.

🖥️ Copie a chave **pública** para a área de transferência:

```bash
cat ~/.ssh/id_ed25519.pub
```

🖥️ Primeiro acesso à VPS (com a senha de root da Hostinger):

```bash
ssh root@SEU.IP.DA.VPS
```

## ETAPA 3 — Atualizar o Ubuntu

☁️

```bash
apt update && apt upgrade -y
```

## ETAPA 4 — Criar usuário de deploy (não trabalhar como root)

☁️

```bash
adduser deploy
```

☁️ Dar poder de administrador e acesso ao Docker:

```bash
usermod -aG sudo,docker deploy
```

## ETAPA 5 — Configurar SSH por chave e desligar senha

☁️ Instalar sua chave pública no usuário `deploy`:

```bash
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
```

☁️ Cole a chave pública (a saída do `cat` da ETAPA 2) dentro do arquivo:

```bash
nano /home/deploy/.ssh/authorized_keys
```

☁️ Ajustar permissões:

```bash
chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh
```

🖥️ **Antes de desligar a senha, teste em OUTRA janela** que a chave funciona:

```bash
ssh deploy@SEU.IP.DA.VPS
```

☁️ Só depois que o teste acima funcionar, desabilite login por senha e por root:

```bash
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/; s/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && sudo systemctl restart ssh
```

> ⚠️ Se você errar esta etapa antes de testar a chave, perde o acesso à VPS. O console de emergência do hPanel é o plano B.

## ETAPA 6 — Firewall

☁️ UFW no sistema operacional:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```

☁️ Conferir:

```bash
sudo ufw status verbose
```

**Também configure o firewall gerenciado da Hostinger** (hPanel → VPS → Firewall): libere apenas 22, 80 e 443. Defesa em profundidade — e importante porque o Docker escreve regras direto no iptables, podendo contornar o UFW.

> Postgres (5432) e Redis (6379) **não aparecem em lugar nenhum** nas regras acima, de propósito. No `docker-compose.prod.yml` eles são publicados apenas em `127.0.0.1` — o loopback da própria máquina, que não passa pelo firewall nem é alcançável de fora. Para inspecionar o banco a partir do seu computador, use um túnel SSH (`ssh -L 5432:127.0.0.1:5432 deploy@SEU.IP.DA.VPS`), nunca uma regra de firewall.

## ETAPAS 7 e 8 — Docker e Docker Compose

Se você usou o template `Ubuntu 24.04 com Docker` da ETAPA 1, **pule**. Apenas confirme:

☁️

```bash
docker --version && docker compose version
```

Se não vier instalado:

☁️

```bash
curl -fsSL https://get.docker.com | sudo sh
```

☁️ Garantir que o Docker sobe sozinho no boot (é isto que faz os containers voltarem após reboot):

```bash
sudo systemctl enable --now docker
```

## ETAPA 9 — Clonar o repositório

☁️ Como usuário `deploy`:

```bash
cd ~ && git clone -b feat/operacao-local-docker https://github.com/wesleyoliveira303wo-spec/Whatsapp_Automatico.git francis
```

> **Branch de deploy:** este primeiro deploy sai da branch `feat/operacao-local-docker`, não de `main`. `main` está vários commits atrás e não tem itens essenciais (`/health/ready`, estabilização F1.10, landing page). A consolidação em `main` é faxina posterior, sem urgência.

Se o repositório for privado, o Git vai pedir usuário/token. Use um **Personal Access Token** do GitHub com escopo `repo` (Settings → Developer settings → Personal access tokens), nunca sua senha.

☁️

```bash
cd ~/francis && git log --oneline -1
```

Confirme que aparece o commit esperado.

## ETAPA 10 — Gerar segredos e criar o `.env` de produção

☁️ Gere **6 segredos novos** (nunca reaproveite os do seu `.env` local):

```bash
for n in POSTGRES_PASSWORD WHATSAPP_CREDENTIALS_MASTER_KEY API_KEY_PEPPER INTERNAL_API_SECRET DASHBOARD_SESSION_SECRET ACCESS_TOKEN_SECRET; do echo "$n=$(openssl rand -base64 32)"; done
```

☁️ Crie o arquivo:

```bash
nano ~/francis/.env
```

Cole o conteúdo abaixo, substituindo os `<...>` pelos valores gerados acima e pela sua chave de IA:

```
POSTGRES_USER=francis
POSTGRES_PASSWORD=<gerado>
POSTGRES_DB=francis
PORT=4000

WHATSAPP_CREDENTIALS_MASTER_KEY=<gerado>
API_KEY_PEPPER=<gerado>
INTERNAL_API_SECRET=<gerado>
DASHBOARD_SESSION_SECRET=<gerado>
ACCESS_TOKEN_SECRET=<gerado>
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=7

AI_PROVIDER=gemini
GEMINI_API_KEY=<sua chave do Google AI Studio>
AI_GEMINI_MODEL=gemini-3.5-flash
AI_GEMINI_MAX_TOKENS=2048
AI_PROMPT_VERSION=v10
AI_HISTORY_LIMIT=20
```

> **`AI_PROMPT_VERSION=v10`** é obrigatório e deliberado: sem esta linha o
> worker cai em `v1` (só anti-alucinação, sem nenhuma postura de venda). `v10`
> é a versão mais refinada em produção.
>
> **`AI_PROVIDER=gemini` (free tier)** é aceito para o piloto de poucos
> clientes de baixo volume — custo US$ 0. Risco conhecido: a cota diária do
> free tier pode travar respostas sob pico (ex.: muitos leads respondendo ao
> mesmo tempo); nesse caso a conversa vira "aguardando atendente" (o fallback
> funciona, só atrasa). Migrar para o tier pago do Gemini é trocar só a
> cobrança na conta do Google — nenhuma mudança de `.env` além da chave.

> `DATABASE_URL`, `REDIS_URL`, `API_BASE_URL` e `INTERNAL_API_BASE_URL` **não vão neste arquivo** — o `docker-compose.prod.yml` já os define com os hostnames corretos da rede interna do Docker. Colocá-los aqui com `localhost` quebraria a comunicação entre containers.

☁️ Proteger o arquivo:

```bash
chmod 600 ~/francis/.env
```

## ETAPAS 11 a 15 — Subir Postgres, Redis, API, Worker e Dashboard

Tudo isso é um único comando — é para isso que o `docker-compose.prod.yml` existe.

☁️ Primeiro, só o banco e o Redis (para poder migrar antes de a aplicação subir):

```bash
cd ~/francis && docker compose -f docker-compose.prod.yml up -d postgres redis
```

☁️ Conferir que os dois estão saudáveis:

```bash
docker compose -f docker-compose.prod.yml ps
```

Aguarde os dois aparecerem como `healthy` (leva ~15s).

## ETAPA 16 — Volumes do Baileys

**Nada a fazer.** Este projeto não guarda sessão do WhatsApp em disco — ela vive cifrada no Postgres (tabela `tenant_credentials`). O volume que importa é o `pgdata`, já declarado no compose e criado automaticamente na etapa anterior.

☁️ Confirmar que o volume existe:

```bash
docker volume ls | grep pgdata
```

## ETAPA 17 — Build das imagens e migrations do Prisma

☁️ Buildar (a primeira vez leva de 3 a 8 minutos):

```bash
cd ~/francis && docker compose -f docker-compose.prod.yml build
```

☁️ Aplicar as migrations no banco de produção:

```bash
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

> `migrate deploy` é o comando correto para produção: aplica apenas migrations já versionadas e **nunca** gera ou reescreve nenhuma (diferente de `migrate dev`, que você usa no Windows).

☁️ Criar o **primeiro tenant** (não existe script para isso — é um INSERT manual):

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U francis -d francis -c "INSERT INTO tenants (id, name, created_at, updated_at) VALUES (gen_random_uuid(), 'Minha Empresa', now(), now()) RETURNING id;"
```

**Copie o `id` (UUID) devolvido** — você vai usá-lo no próximo comando.

☁️ Criar o usuário dono (owner) para fazer login na Dashboard:

```bash
docker compose -f docker-compose.prod.yml run --rm api node apps/api/dist/scripts/createOwner.js <UUID-DO-TENANT> seu@email.com SuaSenhaForte123
```

## ETAPA 18 — Subir a aplicação completa

☁️

```bash
cd ~/francis && docker compose -f docker-compose.prod.yml up -d
```

☁️ Conferir os 5 containers de pé:

```bash
docker compose -f docker-compose.prod.yml ps
```

☁️ Teste local, ainda sem domínio/HTTPS:

```bash
curl -s http://127.0.0.1:4000/health && echo && curl -s http://127.0.0.1:4000/health/ready
```

O segundo deve retornar `{"status":"ok","checks":{"database":"ok","redis":"ok",...}}`. Se vier `degraded`, pare aqui e veja os logs (ETAPA 22) antes de seguir.

## ETAPA 19 — DNS

No painel onde seu domínio está registrado (Hostinger ou outro), crie **dois registros A**:

| Tipo | Nome  | Valor           | TTL  |
| ---- | ----- | --------------- | ---- |
| A    | `app` | `SEU.IP.DA.VPS` | 3600 |
| A    | `api` | `SEU.IP.DA.VPS` | 3600 |

🖥️ Aguarde a propagação (5 a 30 minutos) e confirme:

```bash
nslookup app.SEUDOMINIO.com
```

> Não avance para a ETAPA 20 antes do DNS responder com o IP correto — o Certbot valida o domínio por HTTP e falha se o DNS ainda não propagou.

## ETAPA 20 — Nginx e HTTPS

☁️ Instalar:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

☁️ Instalar a configuração que já está no repositório, trocando o domínio:

```bash
sed "s/SEUDOMINIO.com/SEUDOMINIO.com/g" ~/francis/deploy/nginx/francis.conf | sudo tee /etc/nginx/sites-available/francis.conf
```

> Ajuste o `sed` acima trocando o **segundo** `SEUDOMINIO.com` pelo seu domínio real.

☁️ Ativar o site e remover o default:

```bash
sudo ln -sf /etc/nginx/sites-available/francis.conf /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default
```

☁️ Validar a sintaxe e recarregar:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

☁️ Emitir os certificados TLS (o Certbot reescreve o arquivo adicionando os blocos 443 e o redirect 80→443):

```bash
sudo certbot --nginx -d app.SEUDOMINIO.com -d api.SEUDOMINIO.com
```

Escolha a opção de **redirecionar HTTP para HTTPS** quando perguntado.

☁️ Confirmar que a renovação automática está armada:

```bash
sudo systemctl status certbot.timer
```

---

# Testes pós-deploy

## ETAPA 21 — Health checks

🖥️

```bash
curl -s https://api.SEUDOMINIO.com/health
```

🖥️

```bash
curl -s https://api.SEUDOMINIO.com/health/ready
```

Esperado: `status: ok`, `database: ok`, `redis: ok`, e `aiQueue` com os contadores da fila.

## ETAPA 22 — Logs

☁️ Todos os serviços:

```bash
cd ~/francis && docker compose -f docker-compose.prod.yml logs --tail=100
```

☁️ Só o worker (o mais importante de acompanhar):

```bash
docker compose -f docker-compose.prod.yml logs -f worker
```

## ETAPA 23 — Checklist funcional

Faça na ordem, pelo navegador em `https://app.SEUDOMINIO.com`:

- [ ] Dashboard abre com HTTPS válido (cadeado, sem aviso)
- [ ] Login funciona com o e-mail/senha da ETAPA 17
- [ ] Workspace carrega (grade "Seus WhatsApps", vazia no início)
- [ ] Conectar um WhatsApp: QR Code aparece e o celular escaneia com sucesso
- [ ] Status da sessão vira "Conectado" (bolinha verde)
- [ ] Enviar mensagem de um **outro** celular para o número conectado
- [ ] A mensagem inbound aparece na Dashboard em tempo real (2–4s)
- [ ] A IA gera e envia a resposta automaticamente (chega no celular de teste)
- [ ] Cérebro da IA: salvar um texto de contexto e ver a IA usar na resposta seguinte
- [ ] Botão POWER desliga a IA e a resposta automática realmente para
- [ ] Assumir conversa (handoff) e responder manualmente pela Dashboard
- [ ] Enviar uma imagem/PDF pela Dashboard e confirmar que chega no WhatsApp
- [ ] Receber uma imagem/áudio no WhatsApp e ver renderizada na Dashboard
- [ ] Pipeline (Kanban) mostra o card e permite arrastar entre colunas
- [ ] Analytics carrega os gráficos
- [ ] Multi-tenant: os dados são só do seu tenant (nada vaza)

## ETAPA 24 — Teste de reboot (OBRIGATÓRIO)

Este é o teste que prova que a sessão do WhatsApp sobrevive. **Faça com o WhatsApp já conectado e funcionando.**

☁️ 1. Reiniciar:

```bash
sudo reboot
```

🖥️ 2. Aguarde ~60s e reconecte:

```bash
ssh deploy@SEU.IP.DA.VPS
```

☁️ 3. Verificar que os 5 containers voltaram **sozinhos** (sem você rodar nada):

```bash
cd ~/francis && docker compose -f docker-compose.prod.yml ps
```

☁️ 4. Verificar saúde:

```bash
curl -s http://127.0.0.1:4000/health/ready
```

5. No navegador: Dashboard abre, sessão do WhatsApp aparece **Conectada sem pedir QR Code novo**.
6. Envie uma mensagem do celular de teste e confirme que a IA responde.

Se o passo 5 pedir QR Code novo, **pare e investigue** — significa que as credenciais não foram lidas do Postgres (causa provável: `WHATSAPP_CREDENTIALS_MASTER_KEY` mudou ou o volume `pgdata` foi recriado).

## ETAPA 25 — Backups

Três camadas, da mais barata para a mais completa:

**a) Snapshots da Hostinger** — hPanel → VPS → Snapshots & Backups. Backup semanal já vem incluso no plano; tire um **snapshot manual agora**, com tudo funcionando (é seu ponto de retorno).

**b) Dump do Postgres automatizado** — o dado mais crítico (inclui as credenciais do WhatsApp).

☁️ Criar o script:

```bash
mkdir -p ~/backups && nano ~/backup-db.sh
```

Conteúdo:

```bash
#!/bin/bash
set -e
cd /home/deploy/francis
DATA=$(date +%Y%m%d-%H%M)
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U francis francis | gzip > /home/deploy/backups/francis-$DATA.sql.gz
# Mantém os últimos 14 dumps
ls -t /home/deploy/backups/francis-*.sql.gz | tail -n +15 | xargs -r rm
```

☁️ Tornar executável e agendar para todo dia às 3h:

```bash
chmod +x ~/backup-db.sh && (crontab -l 2>/dev/null; echo "0 3 * * * /home/deploy/backup-db.sh") | crontab -
```

☁️ Testar agora (não espere até amanhã para descobrir que não funciona):

```bash
~/backup-db.sh && ls -lh ~/backups/
```

**c) Cópia fora da VPS** — periodicamente baixe um dump para sua máquina. Backup que só existe no servidor que pode morrer não é backup.

🖥️

```bash
scp deploy@SEU.IP.DA.VPS:/home/deploy/backups/*.sql.gz ./
```

---

# Operação do dia a dia

**Atualizar para uma versão nova do código:**

☁️

```bash
cd ~/francis && git pull && docker compose -f docker-compose.prod.yml up -d --build
```

☁️ Se a atualização trouxe migration nova:

```bash
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

**Reiniciar um serviço específico:**

☁️

```bash
docker compose -f docker-compose.prod.yml restart worker
```

**Ver consumo de recursos:**

☁️

```bash
docker stats --no-stream
```

> ⚠️ **Nunca** rode `docker compose down -v` em produção. O `-v` apaga os volumes — inclusive o `pgdata`, e com ele o banco inteiro e todas as sessões do WhatsApp.

---

# Variáveis de ambiente

| Variável                          | Função                                                    | Onde obter                   | Onde configurar          |
| --------------------------------- | --------------------------------------------------------- | ---------------------------- | ------------------------ |
| `POSTGRES_USER`                   | Usuário do banco                                          | Você define                  | `.env` da VPS            |
| `POSTGRES_PASSWORD`               | Senha do banco                                            | `openssl rand -base64 32`    | `.env` da VPS            |
| `POSTGRES_DB`                     | Nome do banco                                             | Você define                  | `.env` da VPS            |
| `PORT`                            | Porta HTTP da API                                         | Fixo: `4000`                 | `.env` da VPS            |
| `DATABASE_URL`                    | String de conexão do Prisma                               | —                            | ⚙️ já no compose de prod |
| `REDIS_URL`                       | String de conexão do BullMQ                               | —                            | ⚙️ já no compose de prod |
| `WHATSAPP_CREDENTIALS_MASTER_KEY` | **Cifra as credenciais do WhatsApp.** Nunca mudar depois. | `openssl rand -base64 32`    | `.env` da VPS            |
| `API_KEY_PEPPER`                  | Pepper do hash das API keys de tenant                     | `openssl rand -base64 32`    | `.env` da VPS            |
| `ACCESS_TOKEN_SECRET`             | Assina o JWT de acesso                                    | `openssl rand -base64 48`    | `.env` da VPS            |
| `ACCESS_TOKEN_TTL_SECONDS`        | Validade do JWT (default 900)                             | Opcional                     | `.env` da VPS            |
| `REFRESH_TOKEN_TTL_DAYS`          | Validade do refresh token (default 7)                     | Opcional                     | `.env` da VPS            |
| `DASHBOARD_SESSION_SECRET`        | Cifra o cookie httpOnly da Dashboard                      | `openssl rand -base64 32`    | `.env` da VPS            |
| `INTERNAL_API_SECRET`             | Segredo worker↔API (download de mídia)                    | `openssl rand -base64 32`    | `.env` da VPS            |
| `INTERNAL_API_BASE_URL`           | Onde o worker alcança a API                               | —                            | ⚙️ já no compose de prod |
| `API_BASE_URL`                    | Onde o BFF alcança a API                                  | —                            | ⚙️ já no compose de prod |
| `AI_PROVIDER`                     | `gemini` ou `claude`                                      | Você escolhe                 | `.env` da VPS            |
| `GEMINI_API_KEY`                  | Chave do Google AI Studio                                 | aistudio.google.com (grátis) | `.env` da VPS            |
| `AI_GEMINI_MODEL`                 | Modelo Gemini (id fixo, nunca `-latest`)                  | `gemini-3.5-flash`           | `.env` da VPS            |
| `AI_GEMINI_MAX_TOKENS`            | Orçamento de tokens da resposta                           | `2048`                       | `.env` da VPS            |
| `CLAUDE_API_KEY`                  | Chave da Anthropic (só se `AI_PROVIDER=claude`)           | console.anthropic.com        | `.env` da VPS            |
| `AI_CLAUDE_MODEL`                 | Modelo Claude (só se `AI_PROVIDER=claude`)                | docs da Anthropic            | `.env` da VPS            |
| `AI_PROMPT_VERSION`               | `v1` ou `v2` (postura consultiva)                         | Sua escolha                  | `.env` da VPS            |
| `AI_HISTORY_LIMIT`                | Mensagens de histórico enviadas à IA                      | `20`                         | `.env` da VPS            |

---

# Segurança — checklist final

- [ ] SSH só por chave; `PasswordAuthentication no` e `PermitRootLogin no`
- [ ] Trabalhando como `deploy`, não como `root`
- [ ] UFW ativo: só 22, 80, 443
- [ ] Firewall da Hostinger configurado (mesma regra)
- [ ] Postgres e Redis apenas em loopback (confirme: `docker compose -f docker-compose.prod.yml ps` mostra `127.0.0.1:5432`, **nunca** `0.0.0.0:5432`)
- [ ] API e Dashboard publicados só em `127.0.0.1`
- [ ] HTTPS válido nos dois subdomínios, com redirect de HTTP
- [ ] `.env` com `chmod 600`, fora do Git (já está no `.gitignore`)
- [ ] Segredos de produção diferentes dos de desenvolvimento
- [ ] Snapshot manual tirado com tudo funcionando
- [ ] Cron de `pg_dump` testado (não só agendado)
- [ ] Ao menos um dump copiado para fora da VPS
- [ ] Teste de reboot aprovado (ETAPA 24)

---

# Riscos conhecidos

1. **`KeyedMutex` e rate limiter de IA são em memória, não distribuídos.** Corretos para 1 processo (este deploy). Se um dia você rodar 2+ réplicas do worker, precisam virar mecanismos baseados em Redis, senão duas respostas de IA podem ser geradas para a mesma conversa.
2. **`WHATSAPP_CREDENTIALS_MASTER_KEY` é insubstituível.** Se perder ou trocar, todas as sessões de WhatsApp precisam ser reconectadas por QR Code. Guarde uma cópia num gerenciador de senhas.
3. **Sem CI/CD automatizado.** Deploy é manual (`git pull` + `up -d --build`). Intencional para o primeiro deploy; automatizar via GitHub Actions é evolução posterior.
4. **Single point of failure.** Uma VPS, sem redundância. Adequado para beta fechado; não para SLA de produção séria.
5. **Baileys é biblioteca não-oficial** (`7.0.0-rc13`, uma release candidate). O WhatsApp pode mudar o protocolo e quebrar a conexão sem aviso — risco estrutural do produto, não deste deploy.
