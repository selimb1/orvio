import 'dotenv/config';
import app from './app';
import { logger } from './utils/logger';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Graceful shutdown handling
const server = app.listen(PORT, () => {
  logger.info(`🚀 Orvio API corriendo en puerto ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido — cerrando servidor...');
  server.close(() => {
    logger.info('Servidor cerrado correctamente.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recibido — cerrando servidor...');
  server.close(() => {
    logger.info('Servidor cerrado correctamente.');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  // En producción, Sentry capturará esto antes del crash
  process.exit(1);
});

export default server;
