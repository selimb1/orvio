-- ============================================================
-- Orvio — RLS Policies
-- Migration: rls_policies.sql
-- Aplicar DESPUÉS de 001_initial_schema.sql
-- ============================================================
-- Estas políticas garantizan el aislamiento multi-tenant:
-- cada usuario solo puede ver datos de su propio firm_id.
-- El firm_id del usuario autenticado se lee del JWT de Supabase
-- a través de la función get_my_firm_id() definida aquí abajo.
-- ============================================================

-- ============================================================
-- Helper: obtener firm_id del usuario autenticado
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_firm_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT firm_id FROM users WHERE id = auth.uid();
$$;

-- Helper: obtener role del usuario autenticado
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- ============================================================
-- accounting_firms
-- Solo el admin del estudio puede ver/editar su propio firm
-- ============================================================
CREATE POLICY "firms_select_own"
  ON accounting_firms FOR SELECT
  USING (id = get_my_firm_id());

CREATE POLICY "firms_update_admin_only"
  ON accounting_firms FOR UPDATE
  USING (id = get_my_firm_id() AND get_my_role() = 'admin_estudio');

-- No se pueden insertar firms desde el cliente (solo desde service_role)
-- No se pueden eliminar firms desde el cliente

-- ============================================================
-- users
-- ============================================================
-- Todos pueden ver usuarios de su mismo estudio
CREATE POLICY "users_select_same_firm"
  ON users FOR SELECT
  USING (firm_id = get_my_firm_id());

-- Solo admin puede crear/editar/desactivar usuarios
CREATE POLICY "users_insert_admin_only"
  ON users FOR INSERT
  WITH CHECK (firm_id = get_my_firm_id() AND get_my_role() = 'admin_estudio');

CREATE POLICY "users_update_admin_only"
  ON users FOR UPDATE
  USING (firm_id = get_my_firm_id() AND get_my_role() = 'admin_estudio');

-- Un usuario puede actualizar sus propios datos limitados (last_login_at)
CREATE POLICY "users_update_own_profile"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- No DELETE de usuarios (soft delete: is_active = false)

-- ============================================================
-- clients
-- ============================================================
CREATE POLICY "clients_select_own_firm"
  ON clients FOR SELECT
  USING (firm_id = get_my_firm_id());

-- Contadores y admins pueden crear clientes, auxiliares no
CREATE POLICY "clients_insert_contador_or_admin"
  ON clients FOR INSERT
  WITH CHECK (
    firm_id = get_my_firm_id()
    AND get_my_role() IN ('admin_estudio', 'contador')
  );

CREATE POLICY "clients_update_contador_or_admin"
  ON clients FOR UPDATE
  USING (
    firm_id = get_my_firm_id()
    AND get_my_role() IN ('admin_estudio', 'contador')
  );

-- No DELETE de clientes (soft delete: is_active = false)

-- ============================================================
-- bank_statements
-- Acceso a través de client_id → firm_id
-- ============================================================
CREATE POLICY "statements_select_own_firm"
  ON bank_statements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = bank_statements.client_id
        AND c.firm_id = get_my_firm_id()
    )
  );

CREATE POLICY "statements_insert_own_firm"
  ON bank_statements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_id
        AND c.firm_id = get_my_firm_id()
    )
  );

-- Solo el backend (service_role) puede actualizar el status/resultados
-- Desde el cliente no se permite UPDATE

-- ============================================================
-- statement_transactions
-- ============================================================
CREATE POLICY "txn_select_own_firm"
  ON statement_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bank_statements bs
      JOIN clients c ON c.id = bs.client_id
      WHERE bs.id = statement_transactions.statement_id
        AND c.firm_id = get_my_firm_id()
    )
  );

-- Solo el backend inserta transacciones (via service_role)
-- No INSERT desde el cliente anon

-- ============================================================
-- accounting_entries
-- ============================================================
CREATE POLICY "entries_select_own_firm"
  ON accounting_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = accounting_entries.client_id
        AND c.firm_id = get_my_firm_id()
    )
  );

-- ============================================================
-- reconciliation_reports
-- ============================================================
CREATE POLICY "reports_select_own_firm"
  ON reconciliation_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = reconciliation_reports.client_id
        AND c.firm_id = get_my_firm_id()
    )
  );

-- ============================================================
-- login_attempts
-- Solo el service_role puede insertar/leer login_attempts
-- Los usuarios nunca leen esto desde el cliente
-- ============================================================
-- (sin políticas de cliente → tabla totalmente bloqueada para anon/authenticated)
-- El backend usa service_role key para escribir/leer esta tabla.

-- ============================================================
-- audit_log — APPEND ONLY
-- Los usuarios autenticados solo pueden LEER registros de su firm
-- NADIE puede hacer UPDATE o DELETE (ni el admin)
-- Solo el service_role del backend puede insertar
-- ============================================================
CREATE POLICY "audit_log_select_admin_only"
  ON audit_log FOR SELECT
  USING (
    firm_id = get_my_firm_id()
    AND get_my_role() = 'admin_estudio'
  );

-- No INSERT desde cliente (solo service_role)
-- Bloquear UPDATE y DELETE explícitamente:
CREATE POLICY "audit_log_no_update"
  ON audit_log FOR UPDATE
  USING (FALSE);   -- nunca permitido

CREATE POLICY "audit_log_no_delete"
  ON audit_log FOR DELETE
  USING (FALSE);   -- nunca permitido
