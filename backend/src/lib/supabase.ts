import { createClient } from '@supabase/supabase-js';
import { env } from '../utils/env';

/**
 * Cliente de Supabase con anon key — para operaciones del lado del cliente
 * autenticadas con JWT del usuario. RLS aplica.
 */
export const supabaseAnon = createClient(
  env.supabaseUrl(),
  env.supabaseAnonKey(),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Cliente de Supabase con service role key — bypasea RLS.
 * SOLO para uso interno del backend (nunca exponer al cliente).
 * Usar con cuidado: solo en operaciones que requieren acceso cross-tenant
 * o escritura en tablas protegidas (audit_log, login_attempts).
 */
export const supabaseAdmin = createClient(
  env.supabaseUrl(),
  env.supabaseServiceRoleKey(),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
