# ADR 0001 — Infraestrutura de desenvolvimento simplificada

## Status

Aceita.

## Decisão

O desenvolvimento exige apenas PostgreSQL 16 em Docker. Filas usam polling local da outbox e storage/antivírus permanecem em adapters locais. Redis, MinIO e ClamAV serão obrigatórios apenas em homologação e produção.

## Motivo

Reduzir dependências para iniciar o ERP sem acoplar o domínio à infraestrutura. Os contratos preservam a migração para BullMQ, S3 e scanner real.

## Consequências

- O comportamento distribuído e retentativas reais devem ser validados em ambiente de integração.
- Desenvolvimento local é mais rápido e funciona sem Redis.
- Nenhum adapter local deve ser habilitado em produção.
