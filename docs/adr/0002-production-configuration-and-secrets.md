# ADR 0002 — Configuração de produção e segredos

## Status
Aceita em 05/08/2026.

## Decisão
O domínio padrão é `app.sonder.clinic`, configurável por env. O deploy inicial atende uma
clínica, sem remover o suporte multi-clínica.

Redis e MinIO de produção são serviços compartilhados, alcançados pela network overlay externa
`digital_network`. O tráfego HTTP usa `traefik_public`. A stack não cria Redis ou MinIO.
ClamAV fica desabilitado até existir um endpoint configurado. Recursos, healthchecks, política
de reinício e labels do Traefik são obrigatórios no Swarm.

Credenciais de integrações cadastradas na UI são criptografadas com AES-256-GCM usando chave
mestra externa, nunca retornadas em claro, e toda substituição/remoção gera auditoria. Env é
somente bootstrap/fallback. Nibo usa escopo por clínica como padrão, com opção por profissional.
OpenAI é o provider inicial de IA, com provider e modelo substituíveis.

Certificados A1 usam arquivo em secret/path ou upload para storage privado; arquivo e senha são
criptografados separadamente e não podem ser baixados após cadastro. Políticas LGPD, Uso e
Privacidade e branding são configurações versionáveis do tenant, com fallback por env.

## Consequências
- A chave mestra, credenciais, senha e arquivo A1 não podem entrar no Git ou em logs.
- Rotação exige recriptografia controlada dos registros.
- O deploy depende de networks e serviços externos previamente criados.
- Sem ClamAV, uploads ficam explicitamente marcados como não escaneados e não devem ser tratados
  como liberados para fluxos clínicos críticos.
