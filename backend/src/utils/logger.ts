/**
 * Logger centralizado.
 * En producción considerar integrar con Sentry o un servicio de logging estructurado.
 * NUNCA loguear datos sensibles (passwords, tokens, datos personales de clientes).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = process.env.NODE_ENV !== 'production';

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (isDev) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  info(message: string, meta?: unknown): void {
    console.info(formatMessage('info', message, meta));
  },

  warn(message: string, meta?: unknown): void {
    console.warn(formatMessage('warn', message, meta));
  },

  error(message: string, meta?: unknown): void {
    console.error(formatMessage('error', message, meta));
  },
};
