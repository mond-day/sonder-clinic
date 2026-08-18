# Deploy em produção via Portainer (Docker Swarm)

Guia para subir o Sonder Clinic em `clinic.sondercorp.com.br` usando o stack
já pronto em `infra/swarm/stack.production.yml`, assumindo que seu Portainer
já roda em modo Swarm com Traefik e as redes `traefik_public` /
`digital_network`, e que Redis e MinIO/S3 já existem no ambiente.

## 0. Pré-requisitos (confirme antes de começar)

- DNS: `clinic.sondercorp.com.br` e `api.clinic.sondercorp.com.br` apontando
  (A/AAAA ou CNAME) para o IP público do nó Swarm que expõe o Traefik.
- Traefik já publicado nas redes `traefik_public`, com um certresolver
  Let's Encrypt configurado (confirme o **nome** do resolver — vai no
  `TRAEFIK_CERT_RESOLVER`).
- Redis e MinIO/S3 já rodando e acessíveis pela rede `digital_network`.
- Um bucket S3/MinIO criado para uploads (ex: `sonder-clinic`) com
  access key/secret key em mãos.
- Um Postgres gerenciado (fora desta stack) com a `DATABASE_URL` de
  produção.
- SMTP real (obrigatório para "esqueci minha senha" e convites).

## 1. Criar as redes externas (se ainda não existirem)

No nó manager do Swarm:

```bash
docker network create -d overlay traefik_public
docker network create -d overlay digital_network
```

Se o Traefik e o Redis/MinIO já usam essas redes com outro nome, ajuste os
nomes no final de `infra/swarm/stack.production.yml` (seção `networks:`)
em vez de recriar redes.

## 2. Criar os Docker secrets

Os secrets **não** vão no `.env` — são criados direto no Swarm (ou pela UI
do Portainer em *Secrets*). Gere valores fortes e únicos para produção:

```bash
# JWT (mínimo 32 chars cada, valores diferentes)
openssl rand -base64 48 | docker secret create jwt_access_secret -
openssl rand -base64 48 | docker secret create jwt_refresh_secret -

# Chave mestra AES-256-GCM (64 hex chars = 32 bytes)
openssl rand -hex 32 | docker secret create encryption_master_key -

# Credenciais do bucket S3/MinIO já existente
printf '%s' 'SUA_ACCESS_KEY' | docker secret create s3_access_key -
printf '%s' 'SUA_SECRET_KEY' | docker secret create s3_secret_key -
```

Pelo Portainer: **Secrets → Add secret**, um por um, com os mesmos nomes
(`jwt_access_secret`, `jwt_refresh_secret`, `encryption_master_key`,
`s3_access_key`, `s3_secret_key`).

⚠️ Guarde essas chaves em um cofre (1Password/Vault/etc). Perder a
`encryption_master_key` torna as credenciais de integrações já salvas
irrecuperáveis.

## 3. Rodar as migrations no banco de produção

Antes do primeiro deploy, aplique o schema no Postgres de produção (a
partir de uma máquina com acesso à `DATABASE_URL`, fora do Swarm):

```bash
DATABASE_URL="postgresql://usuario:senha@host:5432/sonder_clinic?schema=public" \
  pnpm --filter @sonder/api db:deploy
```

## 4. Preparar as variáveis de ambiente

Copie o template e preencha com os valores reais:

```bash
cp infra/swarm/.env.production.example infra/swarm/.env.production
```

Edite `infra/swarm/.env.production` — os valores já vêm com os domínios
`clinic.sondercorp.com.br` / `api.clinic.sondercorp.com.br` configurados.
Preencha pelo menos: `TRAEFIK_CERT_RESOLVER` (nome real do seu resolver),
`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `SMTP_HOST`/`SMTP_FROM`.

Esse arquivo **não deve ser commitado** (já está no `.gitignore`).

## 5. Deploy do stack no Portainer

1. **Stacks → Add stack**.
2. Nome: `sonder-clinic`.
3. Build method: **Web editor**, cole o conteúdo de
   `infra/swarm/stack.production.yml` (ou use **Repository** apontando
   para este repo/branch + o caminho do arquivo, se preferir deploy via Git).
4. Em **Environment variables**, cole o conteúdo do seu
   `infra/swarm/.env.production` (Portainer aceita colar em bloco no modo
   "Advanced" ou adicionar via upload de `.env`).
5. **Deploy the stack**.

Os secrets criados no passo 2 já ficam disponíveis para os serviços via
Swarm — não precisam ser reconfigurados aqui.

## 6. Verificar

```bash
docker service ls | grep sonder-clinic
docker service logs sonder-clinic_api --tail 100
```

- `https://clinic.sondercorp.com.br/` → web.
- `https://api.clinic.sondercorp.com.br/api/v1/health` → deve responder OK.
- `https://api.clinic.sondercorp.com.br/api/v1/health/ready` → checa DB +
  Redis + storage.

Certificado TLS deve sair automaticamente via Traefik/Let's Encrypt assim
que o DNS resolver corretamente (pode levar alguns minutos na primeira
emissão).

## 7. Checklist antes de liberar para uso real

Ver `docs/PRODUCTION_READINESS.md` — cobre rotação de secrets, backups do
Postgres, teste de upload S3, teste de SMTP, e desabilitar os `*_MOCK` só
com credencial real configurada.
