import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { loginRateLimiter, generalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { clientsRouter } from './routes/clients';
import { module1Router } from './routes/module1';
import { module2Router } from './routes/module2';
import { auditRouter } from './routes/audit';
import { validateEnv } from './utils/env';

// Validar variables de entorno al inicio — falla rápido si faltan
validateEnv();

const app = express();

// Confiar en un solo nivel de proxy (Next.js dev proxy o nginx en producción)
// Necesario para que express-rate-limit pueda leer la IP correctamente
app.set('trust proxy', 1);


// ============================================================
// Headers de seguridad — Helmet
// ============================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 año
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
  })
);

// ============================================================
// CORS — permite el frontend configurado + previews de Vercel
// ============================================================

/**
 * Parsear FRONTEND_URL como lista separada por comas para soportar
 * múltiples orígenes (producción + aliases + dominios custom).
 */
const configuredOrigins: string[] = (process.env.FRONTEND_URL ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  // Lista explícita de orígenes configurados
  if (configuredOrigins.includes(origin)) return true;
  // Cualquier subdominio de Vercel (previews y producción de *.vercel.app)
  if (/^https:\/\/[a-z0-9-]+(\.vercel\.app)$/.test(origin)) return true;
  // Desarrollo local
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requests sin origin (ej. curl, Postman, Render health-check)
      if (!origin) {
        return callback(null, true);
      }
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origen no permitido — ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ============================================================
// Body parsing
// ============================================================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================================
// Rate limiting global
// ============================================================
app.use('/api/', generalRateLimiter);

// ============================================================
// Health check — sin auth (para Render/healthcheck)
// ============================================================
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Rutas de la API
// ============================================================
app.use('/api/auth', loginRateLimiter, authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/module1', module1Router);
app.use('/api/module2', module2Router);
app.use('/api/audit', auditRouter);

// 404 para rutas no definidas
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ============================================================
// Manejador de errores centralizado — SIEMPRE al final
// ============================================================
app.use(errorHandler);

export default app;
