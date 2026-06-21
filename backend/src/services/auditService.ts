import { createHash } from 'crypto';
import { supabaseAdmin } from '../lib/supabase';
import { logger } from '../utils/logger';

type AuditAction =
  | 'login' | 'logout' | 'login_failed'
  | 'client_created' | 'client_updated'
  | 'statement_uploaded' | 'statement_processed'
  | 'entries_uploaded' | 'report_generated'
  | 'export_excel' | 'export_pdf'
  | 'user_created' | 'user_updated' | 'user_deleted'
  | 'mfa_enabled' | 'mfa_disabled';

interface AuditLogParams {
  userId?: string;
  firmId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * Servicio de auditoría.
 * Registra acciones críticas en la tabla audit_log con hash-chaining.
 * 
 * Hash-chaining: cada registro incluye el hash del registro anterior,
 * lo que permite detectar manipulación de la cadena de auditoría.
 * 
 * El hash se calcula como: SHA-256(prevHash + id + userId + action + timestamp)
 */
class AuditService {
  async log(params: AuditLogParams): Promise<void> {
    try {
      // Obtener el hash del último registro del mismo firm (para hash-chaining)
      const lastHash = await this.getLastHash(params.firmId);

      // Generar un ID temporal para el hash (se usará el ID real del insert)
      const timestamp = new Date().toISOString();

      // Calcular hash del nuevo registro
      const rawData = `${lastHash ?? ''}|${params.userId ?? ''}|${params.action}|${timestamp}`;
      const hash = createHash('sha256').update(rawData).digest('hex');

      const { error } = await supabaseAdmin.from('audit_log').insert({
        user_id: params.userId ?? null,
        firm_id: params.firmId ?? null,
        action: params.action,
        resource_type: params.resourceType ?? null,
        resource_id: params.resourceId ?? null,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
        details: params.details ?? null,
        prev_hash: lastHash ?? null,
        hash,
        timestamp,
      });

      if (error) {
        // No lanzar error — el audit log nunca debe romper el flujo principal
        logger.error('Error al insertar en audit_log', { error: error.message });
      }
    } catch (err) {
      // Silencioso para no romper el flujo de la aplicación
      logger.error('Error en auditService.log', err);
    }
  }

  private async getLastHash(firmId?: string): Promise<string | null> {
    if (!firmId) return null;

    try {
      const { data } = await supabaseAdmin
        .from('audit_log')
        .select('hash')
        .eq('firm_id', firmId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      return data?.hash ?? null;
    } catch {
      return null;
    }
  }
}

export const auditService = new AuditService();
