import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogger } from './app-logger';

afterEach(() => {
  vi.restoreAllMocks();
});

function captureStdout() {
  const lines: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

describe('AppLogger', () => {
  it('esconde o mapeamento de rotas em info', () => {
    const lines = captureStdout();
    const logger = new AppLogger(['error', 'warn', 'log']);
    logger.log('Mapped {/api/v1/tasks, GET} route', 'RouterExplorer');
    logger.log('TasksController {/api/v1}:', 'RoutesResolver');
    expect(lines.join('')).toBe('');
  });

  it('mostra o mapeamento de rotas em debug', () => {
    const lines = captureStdout();
    const logger = new AppLogger(['error', 'warn', 'log', 'debug']);
    logger.log('Mapped {/api/v1/tasks, GET} route', 'RouterExplorer');
    expect(lines.join('')).toContain('Mapped {/api/v1/tasks, GET} route');
  });

  it('mantém logs normais em info', () => {
    const lines = captureStdout();
    const logger = new AppLogger(['error', 'warn', 'log']);
    logger.log('Nest application successfully started', 'NestApplication');
    expect(lines.join('')).toContain('Nest application successfully started');
  });
});
