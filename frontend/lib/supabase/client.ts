import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para uso en el navegador (componentes client-side).
 * Usa la ANON key que es segura de exponer en el frontend.
 * RLS en Supabase asegura que cada usuario solo vea sus propios datos.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  );
}
