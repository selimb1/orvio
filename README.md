# Orvio

> SaaS multi-tenant para conciliación bancaria de estudios contables argentinos.

## Stack

| Componente | Tecnología |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Base de datos / Auth | Supabase (PostgreSQL + Supabase Auth) |
| IA | OpenAI API — `gpt-4o` |
| Hosting | Vercel (frontend) + Render (backend) + Supabase Cloud |

## Estructura del repositorio

```
orvio/
├── frontend/          # Next.js → Vercel
├── backend/           # Node/Express → Render
├── supabase/
│   ├── migrations/    # SQL migrations versionadas
│   └── policies/      # RLS policies
├── .github/
│   └── workflows/     # CI/CD
├── docs/
├── .env.example
├── .gitignore
└── README.md
```

## Setup local

### 1. Clonar el repositorio

```bash
git clone https://github.com/selimb1/orvio.git
cd orvio
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
# Backend
cp .env.example backend/.env
# Frontend
cp .env.example frontend/.env.local
```

Completá los valores en cada archivo `.env` con tus credenciales de Supabase, OpenAI, etc.

### 4. Aplicar migrations de Supabase

Desde el panel de Supabase → SQL Editor, ejecutá en orden:

```bash
supabase/migrations/001_initial_schema.sql
supabase/policies/rls_policies.sql
```

O usando la CLI de Supabase:

```bash
npx supabase db push
```

### 5. Correr en desarrollo

```bash
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

## Scripts disponibles

```bash
npm run dev          # Corre frontend + backend en paralelo
npm run build        # Build de producción
npm run lint         # ESLint en todo el monorepo
npm run typecheck    # TypeScript strict check
npm run test         # Tests con Vitest
npm run audit:check  # Seguridad: falla si hay vulnerabilidades críticas
```

## Seguridad

- **Multi-tenancy**: Row Level Security (RLS) en Supabase filtra por `firm_id` del JWT
- **Autenticación**: Supabase Auth con MFA/TOTP (obligatorio para `admin_estudio`)
- **Hashing**: Argon2id (manejado por Supabase Auth internamente)
- **Auditoría**: tabla `audit_log` append-only con hash-chaining
- **Rate limiting**: max 5 intentos de login por IP cada 15 minutos
- **Headers de seguridad**: Helmet.js + CSP + HSTS
- **Dependencias**: Dependabot configurado para alertas de CVE

## Variables de entorno

Ver [`.env.example`](.env.example) para la lista completa. **Nunca commitear valores reales.**

## Módulos

### Módulo 1 — Conciliación bancaria (PDF → Excel)
Sube extractos bancarios argentinos (Galicia, Santander, BBVA, Nación, Macro, ICBC, etc.) y el sistema extrae los movimientos usando `gpt-4o`, los valida con Zod y genera un archivo Excel descargable.

### Módulo 2 — Detección de desvíos
Compara extracto bancario con asientos contables (Tango, Holistor, etc.) y detecta movimientos sin respaldo, diferencias de importe y posibles duplicados.

> ⚠️ **Disclaimer**: Esta herramienta es de apoyo al trabajo contable. La validación final y la responsabilidad profesional son del contador interviniente.

## Licencia

Privado — uso interno del estudio contable.
