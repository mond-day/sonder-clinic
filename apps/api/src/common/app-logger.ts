import { ConsoleLogger, type LogLevel } from '@nestjs/common';

/** Contextos do boot do Nest que listam cada módulo/rota — úteis só em debug. */
const BOOT_NOISE_CONTEXTS = new Set(['RoutesResolver', 'RouterExplorer', 'InstanceLoader']);

export class AppLogger extends ConsoleLogger {
  constructor(logLevels: LogLevel[]) {
    super({ logLevels });
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    const context = optionalParams[optionalParams.length - 1];
    if (typeof context === 'string' && BOOT_NOISE_CONTEXTS.has(context)) {
      super.debug(message, ...optionalParams);
      return;
    }
    super.log(message, ...optionalParams);
  }
}
