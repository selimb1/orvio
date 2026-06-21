import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

/**
 * Error centralizado de la aplicación.
 * Permite adjuntar un status HTTP y un mensaje para el cliente.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Manejador de errores centralizado — SIEMPRE registrar al final de app.use().
 * 
 * Principio: loguear detalle internamente, devolver mensaje genérico al cliente.
 * Nunca enviar stack traces, mensajes de SQL, ni detalles de infraestructura.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Errores de validación de Zod
  if (err instanceof ZodError) {
    logger.warn('Validación fallida', {
      path: req.path,
      errors: err.errors,
    });
    res.status(400).json({
      error: 'Datos inválidos',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Errores operacionales conocidos (AppError)
  if (err instanceof AppError && err.isOperational) {
    logger.warn(`AppError [${err.statusCode}]: ${err.message}`, {
      path: req.path,
    });
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Error de CORS
  if (err instanceof Error && err.message.startsWith('CORS:')) {
    res.status(403).json({ error: 'Origen no permitido' });
    return;
  }

  // Errores no esperados — loguear con detalle, devolver mensaje genérico
  logger.error('Error no manejado', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Ocurrió un error inesperado, intentá nuevamente.',
  });
}
