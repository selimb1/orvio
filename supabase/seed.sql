-- ============================================================
-- Orvio — Seed Data for Development
-- File: supabase/seed.sql
-- ============================================================

-- Enable pgcrypto if not already enabled (done in migration, but safe here too)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create Accounting Firm (Tenant)
INSERT INTO public.accounting_firms (id, name, cuit)
VALUES 
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Estudio Contable Pérez & Asociados', '30-71234567-0')
ON CONFLICT (id) DO NOTHING;

-- 2. Create Auth Users in Supabase's auth schema
-- We create three users:
-- - admin@estudioperez.com (admin_estudio)
-- - contador@estudioperez.com (contador)
-- - auxiliar@estudioperez.com (auxiliar_contable)

-- User 1: Admin
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  'd7b7b12d-0583-4ee2-bb53-e3bdf8a1fca1',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@estudioperez.com',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Esteban Pérez"}',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- User 2: Contador
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  'c3b7b12d-0583-4ee2-bb53-e3bdf8a1fca2',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'contador@estudioperez.com',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Maria Luz"}',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- User 3: Auxiliar
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  'b3b7b12d-0583-4ee2-bb53-e3bdf8a1fca3',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'auxiliar@estudioperez.com',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Juan Gomez"}',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- 3. Create public profiles linking to auth.users
INSERT INTO public.users (id, firm_id, email, full_name, role, mfa_enabled, is_active)
VALUES
  ('d7b7b12d-0583-4ee2-bb53-e3bdf8a1fca1', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'admin@estudioperez.com', 'Esteban Pérez', 'admin_estudio', false, true),
  ('c3b7b12d-0583-4ee2-bb53-e3bdf8a1fca2', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'contador@estudioperez.com', 'Maria Luz', 'contador', false, true),
  ('b3b7b12d-0583-4ee2-bb53-e3bdf8a1fca3', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'auxiliar@estudioperez.com', 'Juan Gomez', 'auxiliar_contable', false, true)
ON CONFLICT (id) DO NOTHING;

-- 4. Create Clients for this Firm
INSERT INTO public.clients (id, firm_id, name, cuit, is_active, created_by)
VALUES
  ('e1a1a1a1-1111-1111-1111-111111111111', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Ferretería El Tornillo S.A.', '20-12345678-9', true, 'd7b7b12d-0583-4ee2-bb53-e3bdf8a1fca1'),
  ('e2a2a2a2-2222-2222-2222-222222222222', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Panificadora Delicias SRL', '30-71234567-0', true, 'd7b7b12d-0583-4ee2-bb53-e3bdf8a1fca1'),
  ('e3a3a3a3-3333-3333-3333-333333333333', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Distribuidora Norte', '23-98765432-9', true, 'c3b7b12d-0583-4ee2-bb53-e3bdf8a1fca2')
ON CONFLICT (id) DO NOTHING;
