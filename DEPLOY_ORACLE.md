# DEPLOY — Produção na Oracle Cloud Always Free (T9)

Runbook do deploy alvo do **T9**: o Francis no ar 24/7, de graça, com HTTPS,
sem domínio próprio. Alternativa ao `DEPLOY.md` (Hostinger + Nginx + domínio),
para quem quer custo zero.

> **Convenção:** 🖥️ = no seu computador · ☁️ = dentro da VM (via SSH) · 📦 = dentro de um container

O assistente **`scripts/deploy-t9-wizard.sh`** (rode 🖥️: `bash scripts/deploy-t9-wizard.sh`)
te guia por tudo isto, gera o `.env` de produção já preenchido e mostra os
comandos exatos para colar na VM. Este documento é a referência de fundo.

Substitua nos comandos:

- `SEU.IP` → o IPv4 público que a Oracle te der
- `SEU-IP-COM-TRACOS` → o mesmo IP com `.` trocado por `-` (ex.: `129.159.1.2` → `129-159-1-2`)
- O host público final é `SEU-IP-COM-TRACOS.sslip.io` (o serviço gratuito sslip.io resolve isso para o IP; nenhum registro de DNS a criar)

---

## Arquitetura

```
INTERNET  ──HTTPS──>  CADDY (container, :80/:443, cert Let's Encrypt automático)
                        ├── /health*  ──> container api        (:4000)  [UptimeRobot]
                        └── /*         ──> container dashboard  (:3000)  [a UI + BFF]

  [rede interna do compose — sem porta pública]
  dashboard ──> api (http://api:4000)
  api ──┬──> postgres:5432  (volume pgdata)
        └──> redis:6379     (volume redisdata)
  worker ──> postgres + redis  (nunca fala HTTP com a api)
  migrate ──> aplica as migrations e sai (api/worker esperam ele terminar)
```

Credenciais do WhatsApp não ficam em disco — ficam cifradas na tabela
`tenant_credentials` do Postgres. Sobreviver a reboot = preservar o volume
`pgdata` **e** a variável `WHATSAPP_CREDENTIALS_MASTER_KEY`. Perder qualquer
um = escanear QR de novo.

---

## ETAPA 1 — Criar a instância (Oracle Cloud console)

1. Entre em <https://cloud.oracle.com> → **Compute → Instances → Create instance**.
2. **Image:** Canonical Ubuntu 22.04 (ou 24.04).
3. **Shape:** `VM.Standard.A1.Flex` (Ampere/ARM) com **1–2 OCPU e 6–12 GB RAM**
   — está dentro do Always Free (o teto é 4 OCPU / 24 GB somados entre instâncias
   A1). Se "out of capacity" na região, tente outra AD, outra região, ou o
   shape `VM.Standard.E2.1.Micro` (x86, 1 OCPU / 1 GB — sobe, mas o `--build`
   fica lento; considere buildar as imagens no seu PC e dar `docker save`/`load`).
4. **SSH keys:** cole a sua chave pública (🖥️ `cat ~/.ssh/id_ed25519.pub` — se
   não tiver, `ssh-keygen -t ed25519 -C francis-deploy`).
5. Crie. Anote o **Public IPv4 address**.

## ETAPA 2 — Abrir as portas 80 e 443 (DOIS lugares)

A Oracle bloqueia entrada por padrão em **duas** camadas. Precisa liberar as duas.

**2a. Security List da VCN (console):**
Networking → Virtual Cloud Networks → sua VCN → Subnet → Security List padrão →
**Add Ingress Rules**, duas regras:

| Source CIDR | IP Protocol | Destination Port |
| ----------- | ----------- | ---------------- |
| `0.0.0.0/0` | TCP         | `80`             |
| `0.0.0.0/0` | TCP         | `443`            |

**2b. Firewall da instância (☁️, via SSH):** as imagens Ubuntu da Oracle vêm
com regras `iptables` que barram tudo fora SSH. Rode na VM:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

(Se a VM usar `firewalld` em vez de `iptables`: `sudo firewall-cmd --permanent --add-service={http,https} && sudo firewall-cmd --reload`.)

## ETAPA 3 — Preparar a VM

🖥️ Acesse:

```bash
ssh ubuntu@SEU.IP
```

☁️ Atualize e instale o Docker:

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

☁️ **Saia e entre de novo no SSH** (para o grupo `docker` valer):

```bash
exit
```

```bash
ssh ubuntu@SEU.IP
docker version   # confirma que roda sem sudo
```

## ETAPA 4 — Trazer o código

☁️

```bash
git clone <URL-do-repositorio> Whatsapp-automatico
cd Whatsapp-automatico
```

## ETAPA 5 — `.env` de produção

O melhor caminho: o assistente 🖥️ `bash scripts/deploy-t9-wizard.sh` gera um
`.env` completo (com todos os `openssl rand` já feitos) e te dá o comando
`scp` para enviá-lo. À mão:

☁️

```bash
cp .env.prod.example .env
nano .env    # preencha SITE_HOST, ACME_EMAIL, GEMINI_API_KEY e todos os "<gere: ...>"
```

Gere cada segredo com `openssl rand -base64 32` (e `48` para `ACCESS_TOKEN_SECRET`).
`SITE_HOST` = `SEU-IP-COM-TRACOS.sslip.io`.

## ETAPA 6 — Subir

☁️

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d --build
```

O serviço `migrate` roda `prisma migrate deploy` automaticamente antes de
`api`/`worker` subirem — **todas as migrations pendentes são aplicadas aqui**.

☁️ Acompanhe:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml ps
docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml logs -f caddy
```

Espere o Caddy dizer que obteve o certificado (`certificate obtained successfully`).
Pode levar 1–2 min na primeira vez.

☁️ Teste local:

```bash
curl -fsS https://SEU-IP-COM-TRACOS.sslip.io/health/ready
```

Deve responder `{"status":"ok",...}`. 🖥️ Abra `https://SEU-IP-COM-TRACOS.sslip.io`
no navegador — a landing do Francis.

## ETAPA 7 — Monitor de uptime (UptimeRobot, grátis)

1. 🖥️ <https://uptimerobot.com> → conta grátis → **Add New Monitor**.
2. Type: **HTTP(s)**. URL: `https://SEU-IP-COM-TRACOS.sslip.io/health/ready`.
3. Monitoring interval: 5 min. **Alert Contacts:** seu e-mail.
4. (Opcional, mais preciso) Advanced → **Keyword** monitor, keyword `"status":"ok"`,
   "alert when keyword NOT exists" — assim um `503 degraded` também dispara alerta.

## ETAPA 8 — Validação real

Faça com um WhatsApp de verdade. Marque cada item.

### Caminho Pro

- [ ] 🖥️ Abrir `https://SEU-IP-COM-TRACOS.sslip.io/register`, criar uma conta.
- [ ] Conectar um número de WhatsApp real pelo QR Code.
- [ ] De outro celular, mandar mensagem para esse número → ela aparece na Dashboard em tempo real.
- [ ] 📦 `docker compose -f docker-compose.prod.yml exec api node apps/api/dist/scripts/setTenantPlan.js "<nome-ou-id-do-tenant>" pro --apply`
- [ ] Mandar outra mensagem → **a IA responde** automaticamente.
- [ ] Na Dashboard, "Assumir conversa" → responder por texto → chega no WhatsApp.
- [ ] Responder com uma imagem/áudio pela Dashboard → chega no WhatsApp.
- [ ] Criar e disparar uma campanha pequena (1–2 contatos que já conversaram) → mensagem entregue.
- [ ] A conversa vira um card no Pipeline (estágio classificado pela IA).
- [ ] Analytics da sessão mostra volume/uso.

### Caminho Grátis

- [ ] 🖥️ Criar uma **segunda** conta (fica `free` por padrão).
- [ ] Conectar um WhatsApp e ver a mensagem chegar na Dashboard.
- [ ] Mandar mensagem → **a IA NÃO responde**.
- [ ] Abrir Cérebro da IA / Pipeline / Campanhas / Contatos / Analytics → cada uma mostra o bloco **"Disponível no Plano Pro"**.
- [ ] Numa conversa, o campo de resposta está trocado pelo aviso de recurso pago (não dá para enviar).
- [ ] "Conectar WhatsApp" e a lista de Conversas continuam acessíveis.

---

## Operação do dia a dia

**Ativar um cliente que pagou** (📦):

```bash
docker compose -f docker-compose.prod.yml exec api node apps/api/dist/scripts/setTenantPlan.js "<tenant>" pro --apply
docker compose -f docker-compose.prod.yml exec api node apps/api/dist/scripts/setTenantPlan.js "<tenant>" enterprise --apply
```

**Rebaixar quem parou de pagar** (📦): `... setTenantPlan.js "<tenant>" free --apply`

**Excluir todos os dados de um cliente a pedido / LGPD** (📦):

```bash
docker compose -f docker-compose.prod.yml exec api node apps/api/dist/scripts/deleteTenant.js "<tenant>"          # simula
docker compose -f docker-compose.prod.yml exec api node apps/api/dist/scripts/deleteTenant.js "<tenant>" --apply  # apaga
```

**Atualizar o Francis** (☁️):

```bash
cd ~/Whatsapp-automatico && git pull
docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d --build
```

**Backup do banco** (☁️, faça periodicamente e leve para fora da VM):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U francis francis | gzip > francis-$(date +%F).sql.gz
```
