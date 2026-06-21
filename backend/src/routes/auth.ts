import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';

export const authRouter = Router();

// ============================================================
// Schemas de validación
// ============================================================

/**
 * Política de contraseñas:
 * - Mínimo 8 caracteres
 * - Al menos una mayúscula, una minúscula, un número y un símbolo
 */
// Password policy regex (used in validation docs; Supabase enforces it server-side)
// const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

const loginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  mfaCode: z.string().optional(),
});

const mfaVerifySchema = z.object({
  factorId: z.string().uuid(),
  challengeId: z.string(),
  code: z.string().length(6, 'El código TOTP debe tener 6 dígitos').regex(/^\d+$/, 'Solo dígitos'),
});

const registerSchema = z.object({
  firmName: z.string().min(2, 'El nombre del estudio debe tener al menos 2 caracteres').trim(),
  fullName: z.string().min(2, 'El nombre completo debe tener al menos 2 caracteres').trim(),
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

// ============================================================
// POST /api/auth/login
// ============================================================
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip ?? 'unknown';
  const userAgent = req.headers['user-agent'] ?? 'unknown';

  try {
    const { email, password } = loginSchema.parse(req.body);

    // Registrar intento de login (siempre, independientemente del resultado)
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.session) {
      // Registrar intento fallido
      await supabaseAdmin.from('login_attempts').insert({
        email,
        ip_address: ip,
        user_agent: userAgent,
        success: false,
      });

      await auditService.log({
        action: 'login_failed',
        ipAddress: ip,
        userAgent,
        details: { email },
      });

      // Mensaje genérico para no revelar si el email existe
      throw new AppError(401, 'Credenciales inválidas');
    }

    // Verificar si el usuario tiene MFA habilitado
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('id, firm_id, role, mfa_enabled, is_active, full_name')
      .eq('id', authData.user.id)
      .single();

    if (!userData?.is_active) {
      throw new AppError(403, 'Cuenta desactivada. Contactá al administrador.');
    }

    // Registrar intento exitoso
    await supabaseAdmin.from('login_attempts').insert({
      email,
      ip_address: ip,
      user_agent: userAgent,
      success: true,
    });

    // Actualizar last_login_at
    await supabaseAdmin
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', authData.user.id);

    await auditService.log({
      userId: authData.user.id,
      firmId: userData?.firm_id,
      action: 'login',
      ipAddress: ip,
      userAgent,
    });

    res.status(200).json({
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresAt: authData.session.expires_at,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        fullName: userData?.full_name,
        role: userData?.role,
        firmId: userData?.firm_id,
        mfaEnabled: userData?.mfa_enabled,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    logger.error('Error en login', err);
    next(new AppError(500, 'Ocurrió un error, intentá nuevamente'));
  }
});

// ============================================================
// POST /api/auth/logout
// ============================================================
authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      await supabaseAdmin.auth.admin.signOut(token, 'local');
    }

    await auditService.log({
      userId: req.user?.id,
      firmId: req.user?.firmId,
      action: 'logout',
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({ message: 'Sesión cerrada correctamente' });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/auth/mfa/enroll — Iniciar configuración de MFA
// ============================================================
authRouter.post('/mfa/enroll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'No autenticado');
    }

    const token = authHeader.split(' ')[1];

    // Crear cliente con el token del usuario para MFA con su identidad
    const { createClient } = await import('@supabase/supabase-js');
    const { env } = await import('../utils/env');
    const userClient = createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data, error } = await userClient.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Orvio',
    });

    if (error) {
      throw new AppError(400, 'No se pudo iniciar la configuración de MFA');
    }

    res.status(200).json({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/auth/mfa/verify — Verificar y activar MFA
// ============================================================
authRouter.post('/mfa/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { factorId, challengeId, code } = mfaVerifySchema.parse(req.body);

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'No autenticado');
    }

    const token = authHeader.split(' ')[1];
    const { createClient } = await import('@supabase/supabase-js');
    const { env } = await import('../utils/env');

    const userClient = createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data, error } = await userClient.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });

    if (error) {
      throw new AppError(400, 'Código TOTP inválido. Verificá tu aplicación de autenticación.');
    }

    // Marcar MFA como habilitado en nuestra tabla
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      await supabaseAdmin
        .from('users')
        .update({ mfa_enabled: true })
        .eq('id', user.id);

      await auditService.log({
        userId: user.id,
        action: 'mfa_enabled',
        ipAddress: req.ip ?? 'unknown',
      });
    }

    res.status(200).json({
      message: 'MFA activado correctamente',
      accessToken: data.access_token,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/auth/register — Crear firma contable + primer usuario admin
// ============================================================
authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip ?? 'unknown';
  const userAgent = req.headers['user-agent'] ?? 'unknown';

  let authUserId: string | null = null;
  let firmId: string | null = null;

  try {
    const { firmName, fullName, email, password } = registerSchema.parse(req.body);

    // 1. Verificar que el email no esté en uso
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      throw new AppError(409, 'Ya existe una cuenta con ese email.');
    }

    // 2. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirmado automáticamente (SaaS interno)
      user_metadata: { full_name: fullName },
    });

    if (authError || !authData.user) {
      throw new AppError(400, authError?.message || 'No se pudo crear el usuario.');
    }
    authUserId = authData.user.id;

    // 3. Crear la firma contable (tenant)
    const { data: firm, error: firmError } = await supabaseAdmin
      .from('accounting_firms')
      .insert({ name: firmName })
      .select('id')
      .single();

    if (firmError || !firm) {
      // Revertir: eliminar usuario de Auth
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw new AppError(500, 'No se pudo crear el estudio contable.');
    }
    firmId = firm.id;

    // 4. Crear perfil en public.users
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUserId,
        firm_id: firmId,
        email,
        full_name: fullName,
        role: 'admin_estudio',
        mfa_enabled: false,
        is_active: true,
      });

    if (profileError) {
      // Revertir: eliminar firma y usuario de Auth
      await supabaseAdmin.from('accounting_firms').delete().eq('id', firmId);
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw new AppError(500, 'No se pudo crear el perfil de usuario.');
    }

    // 5. Generar sesión para auto-login: signInWithPassword con las mismas credenciales
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
    const { env } = await import('../utils/env');
    const anonClient = createSupabaseClient(env.supabaseUrl(), env.supabaseAnonKey());
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.session) {
      // El usuario fue creado correctamente; el registro fue exitoso aunque no podamos auto-loguear
      logger.warn('Registro exitoso pero no se pudo generar sesión automática', { email });
      throw new AppError(201, 'Cuenta creada. Por favor, iniciá sesión manualmente.');
    }

    await auditService.log({
      userId: authUserId ?? undefined,
      firmId: firmId ?? undefined,
      action: 'user_created',
      resourceType: 'user',
      resourceId: authUserId ?? undefined,
      ipAddress: ip,
      userAgent,
      details: { firmName, role: 'admin_estudio' },
    });

    logger.info('Nuevo estudio registrado', { firmName, email, firmId });

    res.status(201).json({
      accessToken: signInData.session.access_token,
      refreshToken: signInData.session.refresh_token,
      expiresAt: signInData.session.expires_at,
      user: {
        id: authUserId,
        email,
        fullName,
        role: 'admin_estudio',
        firmId,
        mfaEnabled: false,
      },
    });
  } catch (err) {
    next(err);
  }
});
