import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

/**
 * Rate limiter específico para endpoints de login.
 * Máximo 5 intentos por IP cada 15 minutos.
 * Después del límite, devuelve 429 con un mensaje claro.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  standardHeaders: true,  // Incluye RateLimit-* headers en la respuesta
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de acceso. Intentá nuevamente en 15 minutos.',
  },
  handler: (req, res, _next, options) => {
    logger.warn('Rate limit excedido en login', {
      ip: req.ip,
      path: req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
  skip: () => process.env.NODE_ENV === 'test', // No aplicar en tests
});

/**
 * Rate limiter general para toda la API.
 * Máximo 200 requests por IP cada 15 minutos.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas solicitudes. Intentá nuevamente en unos minutos.',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter para uploads de archivos (procesamiento IA es costoso).
 * Máximo 10 uploads por usuario cada hora.
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Límite de uploads alcanzado. Podés subir hasta 10 archivos por hora.',
  },
  skip: () => process.env.NODE_ENV === 'test',
});
