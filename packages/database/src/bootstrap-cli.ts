import { BootstrapError, runProductionBootstrap } from './bootstrap';

void runProductionBootstrap()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    console.error(JSON.stringify({
      service: 'sonder-db-bootstrap',
      event: 'failed',
      error: message,
    }));
    process.exitCode = error instanceof BootstrapError ? error.exitCode : 1;
  });
