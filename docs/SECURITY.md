# Segurança

## Controles implementados

- Senhas com Argon2id.
- Refresh tokens aleatórios armazenados somente como SHA-256, rotativos e revogáveis.
- Cookies HttpOnly, `SameSite=Lax` e `Secure` configurável.
- Escopo de organização derivado do JWT, nunca de filtro fornecido pelo cliente.
- DTOs HTTP com whitelist e rejeição de campos desconhecidos.
- Credenciais de integrações somente por variáveis de ambiente.
- Registros clínicos, tokens e segredos não devem ser escritos em logs.

## Antes de produção

1. Trocar todos os segredos de desenvolvimento e ativar `COOKIE_SECURE=true`.
2. Implementar proteção CSRF explícita para rotas mutáveis baseadas em cookie.
3. Adicionar rate limiting diferenciado para login, links públicos, uploads e webhooks.
4. Usar envelope encryption para credenciais externas e certificados A1.
5. Aplicar RBAC por permissão em todos os endpoints e testes de isolamento multi-clínica.
6. Adicionar constraint de exclusão PostgreSQL para conflitos de agenda.
7. Validar assinatura e idempotência dos webhooks.
8. Executar análise de dependências, SAST, backup e teste de restauração.

O `.env` não deve ser versionado. O arquivo `.env.example` contém apenas valores locais e placeholders.
