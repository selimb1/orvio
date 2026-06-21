import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { rbac } from '../middleware/rbac';
import multer from 'multer';
import { AppError } from '../middleware/errorHandler';
import { supabaseAdmin } from '../lib/supabase';
import { accountingParserService } from '../services/accountingParserService';
import { reconciliationService, BankTransactionInput } from '../services/reconciliationService';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';

export const module2Router = Router();

// Todos los de Módulo 2 requieren autenticación
module2Router.use(authMiddleware);

// Multer in-memory storage for Excel/CSV upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // Max 20MB
});

const uploadMiddleware = upload.single('accountingFile');

// ============================================================
// POST /api/module2/upload — Reconciliar extracto con asientos contables
// ============================================================
module2Router.post(
  '/upload',
  rbac('admin_estudio', 'contador'),
  (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      const { clientId, statementId } = req.body;

      if (!file) {
        throw new AppError(400, 'Falta el archivo contable (accountingFile)');
      }
      if (!clientId) {
        throw new AppError(400, 'Falta el clientId');
      }
      if (!statementId) {
        throw new AppError(400, 'Falta el statementId');
      }

      // 1. Verificar que el cliente y el extracto pertenecen al tenant
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('id, firm_id')
        .eq('id', clientId)
        .eq('firm_id', req.user!.firmId)
        .single();

      if (!client) {
        throw new AppError(404, 'Cliente no encontrado');
      }

      const { data: statement } = await supabaseAdmin
        .from('bank_statements')
        .select('id, file_name, status')
        .eq('id', statementId)
        .eq('client_id', clientId)
        .single();

      if (!statement) {
        throw new AppError(404, 'Extracto bancario no encontrado');
      }
      if (statement.status !== 'completed') {
        throw new AppError(400, 'El extracto bancario seleccionado no ha finalizado su procesamiento.');
      }

      // 2. Traer transacciones del extracto
      const { data: bankTxns, error: txnsError } = await supabaseAdmin
        .from('statement_transactions')
        .select('id, txn_date, description, debit, credit, balance')
        .eq('statement_id', statementId);

      if (txnsError || !bankTxns) {
        throw new AppError(500, 'Error al recuperar los movimientos del extracto');
      }

      // 3. Parsear el archivo contable
      const accEntries = await accountingParserService.parseFile(file.buffer, file.mimetype);
      if (accEntries.length === 0) {
        throw new AppError(400, 'No se encontraron asientos contables válidos en el archivo subido.');
      }

      // 4. Ejecutar conciliación / comparación
      const deviations = reconciliationService.reconcile(
        bankTxns as BankTransactionInput[],
        accEntries
      );

      // 5. Guardar los asientos contables en la base de datos (con un batch UUID único)
      // Use req.user!.id (set by authMiddleware) instead of fetching again from Supabase
      const entriesBatch = crypto.randomUUID();

      const dbEntries = accEntries.map(entry => ({
        client_id: clientId,
        uploaded_by: req.user!.id,
        source_file: file.originalname,
        entry_date: entry.entryDate,
        description: entry.description,
        debit: entry.debit,
        credit: entry.credit,
        account_code: entry.accountCode,
        account_name: entry.accountName,
      }));

      // Guardar asientos por lotes para evitar límites de Postgres
      if (dbEntries.length > 0) {
        const { error: insertEntriesError } = await supabaseAdmin
          .from('accounting_entries')
          .insert(dbEntries);
        if (insertEntriesError) {
          logger.error('Error insertando asientos contables', insertEntriesError);
        }
      }

      // 6. Registrar informe de conciliación
      const { data: report, error: reportError } = await supabaseAdmin
        .from('reconciliation_reports')
        .insert({
          client_id: clientId,
          statement_id: statementId,
          entries_batch: entriesBatch,
          deviations: deviations,
          total_deviations: deviations.length,
          generated_by: req.user!.id,
        })
        .select()
        .single();

      if (reportError || !report) {
        throw new AppError(500, 'Error al guardar el reporte de conciliación');
      }

      // 7. Registrar acción de auditoría
      await auditService.log({
        userId: req.user!.id,
        firmId: req.user!.firmId,
        action: 'report_generated',
        resourceType: 'reconciliation_report',
        resourceId: report.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { totalDeviations: deviations.length, statementId },
      });

      res.status(201).json({
        reportId: report.id,
        totalDeviations: report.total_deviations,
        deviations: report.deviations,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// GET /api/module2/:id — Obtener reporte de desvíos por ID
// ============================================================
module2Router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: report, error } = await supabaseAdmin
      .from('reconciliation_reports')
      .select(`
        id, client_id, statement_id, entries_batch, deviations, total_deviations, generated_at,
        clients!inner(firm_id, name)
      `)
      .eq('id', id)
      .eq('clients.firm_id', req.user!.firmId)
      .single();

    if (error || !report) {
      throw new AppError(404, 'Reporte de conciliación no encontrado');
    }

    res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/module2/client/:clientId — Listar reportes de un cliente
// ============================================================
module2Router.get('/client/:clientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId } = req.params;

    // Verificar acceso al cliente
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('firm_id', req.user!.firmId)
      .single();

    if (!client) throw new AppError(404, 'Cliente no encontrado');

    const { data: reports, error } = await supabaseAdmin
      .from('reconciliation_reports')
      .select(`
        id, total_deviations, generated_at,
        bank_statements (file_name)
      `)
      .eq('client_id', clientId)
      .order('generated_at', { ascending: false });

    if (error) throw new AppError(500, 'Error al listar reportes');

    res.status(200).json({ reports: reports || [] });
  } catch (err) {
    next(err);
  }
});
