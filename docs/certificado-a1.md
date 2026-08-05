# Certificado digital A1

## Implementação de desenvolvimento

O endpoint autenticado `POST /api/v1/settings/certificate` recebe `multipart/form-data` com
`clinicId`, `file` e `password`. Aceita somente `.pfx`/`.p12` de até 5 MB. O conteúdo é
interpretado como PKCS#12; extensão válida sem parse válido é rejeitada.

O arquivo fica fora de `public/`, em `.data/certificates/` (ignorada pelo Git), com diretórios
`0700`, arquivo `0600` e nome aleatório. A senha é criptografada por AES-256-GCM com
`ENCRYPTION_MASTER_KEY`. A API retorna somente titular, emissor, número de série e validade.
Não há endpoint de download.

`GET /api/v1/settings/certificate?clinicId=...` retorna o status seguro.
`DELETE /api/v1/settings/certificate?clinicId=...` remove o objeto privado. Todas as trocas e
remoções geram `AuditEvent`, sempre limitadas à organização do JWT e à clínica informada.

## Produção e riscos

`FileObject` persiste `bucket`/`objectKey`, checksum e metadados, sem blob no PostgreSQL. Isso
preserva o contrato necessário para substituir o driver local por MinIO/S3 privado. O driver
local é apropriado para desenvolvimento e nó único; em produção distribuída, deve ser trocado
pelo adapter de object storage antes de habilitar upload.

O parse PKCS#12 confirma estrutura, senha e certificado, mas não valida cadeia ICP-Brasil,
revogação ou finalidade de assinatura. Portanto, a presença do arquivo não deve ser apresentada
como assinatura válida. Backups da pasta e da chave mestra são dados altamente sensíveis.

O teste `certificate.service.spec.ts` gera certificado e PKCS#12 em memória durante a execução;
nenhum certificado ou senha real é versionado.
