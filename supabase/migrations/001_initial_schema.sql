-- ============================================================
-- Orvio — Schema inicial
-- Migration: 001_initial_schema.sql
-- Aplicar desde: Supabase SQL Editor o supabase db push
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin_estudio', 'contador', 'auxiliar_contable');
CREATE TYPE statement_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE deviation_severity AS ENUM ('high', 'medium', 'low', 'info');
CREATE TYPE audit_action AS ENUM (
  'login', 'logout', 'login_failed',
  'client_created', 'client_updated',
  'statement_uploaded', 'statement_processed',
  'entries_uploaded', 'report_generated',
  'export_excel', 'export_pdf',
  'user_created', 'user_updated', 'user_deleted',
  'mfa_enabled', 'mfa_disabled'
);

-- ============================================================
-- accounting_firms — root de cada tenant
-- ============================================================
CREATE TABLE accounting_firms (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  cuit          TEXT UNIQUE CHECK (cuit IS NULL OR cuit ~ '^\d{2}-\d{8}-\d$'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_firms_updated_at
  BEFORE UPDATE ON accounting_firms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- users — extensión de auth.users de Supabase
-- Supabase Auth maneja el password hashing (argon2 internamente)
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id         UUID NOT NULL REFERENCES accounting_firms(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  full_name       TEXT,
  role            user_role NOT NULL DEFAULT 'contador',
  mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_firm_id ON users(firm_id);
CREATE INDEX idx_users_email ON users(email);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- clients — clientes del estudio contable
-- ============================================================
CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         UUID NOT NULL REFERENCES accounting_firms(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  cuit            TEXT CHECK (cuit IS NULL OR cuit ~ '^\d{2}-\d{8}-\d$'),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_firm_id ON clients(firm_id);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- bank_statements — extractos bancarios subidos
-- ============================================================
CREATE TABLE bank_statements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  file_name       TEXT NOT NULL,
  file_size_bytes BIGINT,
  bank_detected   TEXT,          -- 'Galicia', 'Santander', etc.
  period_from     DATE,
  period_to       DATE,
  account_number  TEXT,
  status          statement_status NOT NULL DEFAULT 'pending',
  error_message   TEXT,          -- null si procesó ok
  storage_path    TEXT,          -- path en Supabase Storage
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_statements_client_id ON bank_statements(client_id);
CREATE INDEX idx_bank_statements_uploaded_by ON bank_statements(uploaded_by);

CREATE TRIGGER bank_statements_updated_at
  BEFORE UPDATE ON bank_statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- statement_transactions — movimientos extraídos por IA
-- ============================================================
CREATE TABLE statement_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id    UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  txn_date        DATE NOT NULL,
  description     TEXT NOT NULL,
  debit           NUMERIC(18, 2),
  credit          NUMERIC(18, 2),
  balance         NUMERIC(18, 2),
  -- Solo uno de debit/credit puede tener valor por fila
  CONSTRAINT chk_debit_or_credit CHECK (
    (debit IS NULL) != (credit IS NULL) OR (debit IS NULL AND credit IS NULL)
  ),
  raw_ai_response JSONB,         -- respuesta cruda del modelo (para auditoría)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stmt_txn_statement_id ON statement_transactions(statement_id);
CREATE INDEX idx_stmt_txn_date ON statement_transactions(txn_date);

-- ============================================================
-- accounting_entries — asientos contables subidos (Módulo 2)
-- ============================================================
CREATE TABLE accounting_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  source_file     TEXT NOT NULL,
  entry_date      DATE NOT NULL,
  description     TEXT NOT NULL,
  debit           NUMERIC(18, 2),
  credit          NUMERIC(18, 2),
  account_code    TEXT,
  account_name    TEXT,
  source_system   TEXT,          -- 'Tango', 'Holistor', 'otro'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_acc_entries_client_id ON accounting_entries(client_id);
CREATE INDEX idx_acc_entries_date ON accounting_entries(entry_date);

-- ============================================================
-- reconciliation_reports — reportes de desvíos (Módulo 2)
-- ============================================================
CREATE TABLE reconciliation_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  statement_id    UUID NOT NULL REFERENCES bank_statements(id),
  entries_batch   UUID,          -- referencia a un conjunto de accounting_entries
  deviations      JSONB,         -- array de desvíos detectados con severidad
  total_deviations INT,
  generated_by    UUID NOT NULL REFERENCES users(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recon_reports_client_id ON reconciliation_reports(client_id);

-- ============================================================
-- login_attempts — para rate limiting y alertas
-- ============================================================
CREATE TABLE login_attempts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT,
  ip_address  TEXT NOT NULL,
  user_agent  TEXT,
  success     BOOLEAN NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address, timestamp);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, timestamp);

-- ============================================================
-- audit_log — registro inmutable de acciones críticas
-- append-only: RLS bloqueará UPDATE y DELETE
-- hash_chaining: prev_hash + hash para detectar manipulación
-- ============================================================
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  firm_id         UUID REFERENCES accounting_firms(id),
  action          audit_action NOT NULL,
  resource_type   TEXT,          -- 'bank_statement', 'client', 'user', etc.
  resource_id     UUID,
  ip_address      TEXT,
  user_agent      TEXT,
  details         JSONB,         -- metadata adicional
  prev_hash       TEXT,          -- hash del registro anterior (hash-chaining)
  hash            TEXT,          -- sha256(prev_hash || id || user_id || action || timestamp)
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id, timestamp);
CREATE INDEX idx_audit_log_firm_id ON audit_log(firm_id, timestamp);
CREATE INDEX idx_audit_log_action ON audit_log(action, timestamp);

-- ============================================================
-- Habilitar Row Level Security en todas las tablas
-- Las políticas se definen en rls_policies.sql
-- ============================================================
ALTER TABLE accounting_firms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;
