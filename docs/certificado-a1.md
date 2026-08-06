# Certificado digital A1

## Implementação

O endpoint autenticado `POST /api/v1/settings/certificate` recebe `multipart/form-data` com
`clinicId`, `file` e `password`. Aceita somente `.pfx`/`.p12` de até 5 MB. O conteúdo é
interpretado como PKCS#12; extensão válida sem parse válido é rejeitada.

O blob é gravado pelo adapter unificado `@sonder/storage`:

| Ambiente | Driver | Comportamento |
|----------|--------|---------------|
| Desenvolvimento | `STORAGE_DRIVER=local` (padrão) | Disco em `STORAGE_LOCAL_PATH` (`.data/storage`) com prefixo `certificates/` |
| Produção | `STORAGE_DRIVER=minio` ou `s3` | Object storage com `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` |

Se o driver MinIO/S3 estiver selecionado **sem** credenciais, o upload **falha** com erro explícito
(`storageEnabled=false`) — não há simulação de sucesso.

A senha é criptografada por AES-256-GCM com `ENCRYPTION_MASTER_KEY`. `FileObject` persiste
`bucket`/`objectKey`, checksum, `metadata.kind=certificate-a1` e metadados do X.509 (titular,
emissor, série, validade). A API retorna somente esses campos. Não há endpoint de download.

`GET /api/v1/settings/certificate?clinicId=...` retorna o status seguro (inclui `storageDriver`).
`DELETE /api/v1/settings/certificate?clinicId=...` remove o objeto privado. Todas as trocas e
remoções geram `AuditEvent`, sempre limitadas à organização do JWT e à clínica informada.

Objetos legados em `.data/certificates` (bucket lógico `certificates`) continuam legíveis no
status/remoção; novos uploads usam apenas o adapter unificado. Reenvie o certificado após
upgrade se o arquivo legado não estiver mais acessível no nó.

## Produção e riscos

O parse PKCS#12 confirma estrutura, senha e certificado, mas não valida cadeia ICP-Brasil,
revogação ou finalidade de assinatura. Portanto, a presença do arquivo não deve ser apresentada
como assinatura válida. Backups do storage e da chave mestra são dados altamente sensíveis.

O teste `certificate.service.spec.ts` gera certificado e PKCS#12 em memória durante a execução;
nenhum certificado ou senha real é versionado.
