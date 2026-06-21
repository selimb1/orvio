/**
 * Validación de variables de entorno al startup.
 * Falla inmediatamente si falta alguna variable crítica.
 * Nunca loguear los valores — solo los nombres.
 */

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'FRONTEND_URL',
  'NODE_ENV',
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `❌ Variables de entorno faltantes: ${missing.join(', ')}\n` +
        `   Copiá .env.example como .env y completá los valores.`
    );
    process.exit(1);
  }
}

/**
 * Acceso tipado a las variables de entorno.
 * Usar siempre estas funciones en lugar de process.env directo.
 */
export const env = {
  supabaseUrl: (): string => process.env.SUPABASE_URL!,
  supabaseAnonKey: (): string => process.env.SUPABASE_ANON_KEY!,
  supabaseServiceRoleKey: (): string => process.env.SUPABASE_SERVICE_ROLE_KEY!,
  openaiApiKey: (): string => process.env.OPENAI_API_KEY!,
  openaiModel: (): string => process.env.OPENAI_MODEL ?? 'gpt-4o',
  frontendUrl: (): string => process.env.FRONTEND_URL!,
  nodeEnv: (): string => process.env.NODE_ENV ?? 'development',
  isProduction: (): boolean => process.env.NODE_ENV === 'production',
  sentryDsn: (): string | undefined => process.env.SENTRY_DSN,
};
