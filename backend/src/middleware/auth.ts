import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { logger } from '../utils/logger';

/**
 * Extiende la interfaz Request de Express para incluir datos del usuario autenticado.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firmId: string;
        role: 'admin_estudio' | 'contador' | 'auxiliar_contable';
      };
    }
  }
}

/**
 * Middleware de autenticación.
 * Verifica el Bearer JWT de Supabase Auth en el header Authorization.
 * Si es válido, carga los datos del usuario en req.user.
 * Si no, devuelve 401 con mensaje genérico.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verificar el JWT con Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Token inválido o expirado' });
      return;
    }

    // Obtener datos del usuario desde nuestra tabla users
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, firm_id, role, is_active')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      logger.warn('Usuario autenticado pero no encontrado en tabla users', { userId: user.id });
      res.status(401).json({ error: 'Usuario no encontrado' });
      return;
    }

    if (!userData.is_active) {
      res.status(403).json({ error: 'Cuenta desactivada. Contactá al administrador.' });
      return;
    }

    req.user = {
      id: userData.id,
      email: user.email ?? '',
      firmId: userData.firm_id,
      role: userData.role,
    };

    next();
  } catch (err) {
    logger.error('Error en authMiddleware', err);
    res.status(500).json({ error: 'Ocurrió un error, intentá nuevamente' });
  }
}
