import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { rbac } from '../middleware/rbac';
import { uploadPdf, validatePdfContent } from '../middleware/fileUpload';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { pdfService } from '../services/pdfService';
import { openaiService } from '../services/openaiService';
import { excelService } from '../services/excelService';
import { auditService } from '../services/auditService';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const module1Router = Router();

// Todos los endpoints requieren autenticación
module1Router.use(authMiddleware);

// ============================================================
// POST /api/module1/upload — Subir PDF y procesar con IA
// ============================================================
module1Router.post(
  '/upload',
  rbac('admin_estudio', 'contador'),
  uploadRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    // Multer maneja el upload
    uploadPdf(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  validatePdfContent,
  async (req: Request, res: Response, next: NextFunction) => {
    const file = req.file!;
    const { clientId } = req.body;

    if (!clientId) {
      res.status(400).json({ error: 'Se requiere clientId' });
      return;
    }

    try {
      // 1. Verificar que el cliente pertenece al tenant
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('id, firm_id')
        .eq('id', clientId)
        .eq('firm_id', req.user!.firmId)
        .single();

      if (!client) {
        throw new AppError(404, 'Cliente no encontrado');
      }

      // 2. Crear registro de bank_statement en estado 'processing'
      const { data: statement, error: stmtError } = await supabaseAdmin
        .from('bank_statements')
        .insert({
          client_id: clientId,
          uploaded_by: req.user!.id,
          file_name: file.originalname,
          file_size_bytes: file.size,
          status: 'processing',
        })
        .select()
        .single();

      if (stmtError || !statement) {
        throw new AppError(500, 'Error al registrar el extracto');
      }

      await auditService.log({
        userId: req.user!.id,
        firmId: req.user!.firmId,
        action: 'statement_uploaded',
        resourceType: 'bank_statement',
        resourceId: statement.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { fileName: file.originalname, fileSize: file.size },
      });

      // Responder inmediatamente con el ID del statement (procesamiento es asíncrono)
      res.status(202).json({
        statementId: statement.id,
        status: 'processing',
        message: 'Extracto recibido. El procesamiento está en curso.',
      });

      // 3. Procesar en background (no bloquear la respuesta HTTP)
      processStatementInBackground(statement.id, file.buffer, req.user!.id).catch((err) => {
        logger.error('Error en procesamiento en background', { statementId: statement.id, err });
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// Función de procesamiento en background
// ============================================================
async function processStatementInBackground(
  statementId: string,
  fileBuffer: Buffer,
  userId: string
): Promise<void> {
  try {
    // Extraer texto o imágenes del PDF
    const pdfContent = await pdfService.extractContent(fileBuffer);

    // Enviar a OpenAI para extracción de movimientos
    const extractedData = await openaiService.extractBankTransactions(pdfContent);

    // Guardar las transacciones en la BD
    const transactions = extractedData.transactions.map((t) => ({
      statement_id: statementId,
      txn_date: t.date,
      description: t.description,
      debit: t.debit ?? null,
      credit: t.credit ?? null,
      balance: t.balance ?? null,
      raw_ai_response: t,
    }));

    if (transactions.length > 0) {
      await supabaseAdmin.from('statement_transactions').insert(transactions);
    }

    // Actualizar el statement con resultados
    await supabaseAdmin
      .from('bank_statements')
      .update({
        status: 'completed',
        bank_detected: extractedData.bankName ?? null,
        period_from: extractedData.periodFrom ?? null,
        period_to: extractedData.periodTo ?? null,
        account_number: extractedData.accountNumber ?? null,
      })
      .eq('id', statementId);

    await auditService.log({
      userId,
      action: 'statement_processed',
      resourceType: 'bank_statement',
      resourceId: statementId,
      details: { transactionCount: transactions.length, bankDetected: extractedData.bankName },
    });

    logger.info('Extracto procesado correctamente', {
      statementId,
      transactions: transactions.length,
      bank: extractedData.bankName,
    });
  } catch (err) {
    logger.error('Error procesando extracto', { statementId, err });

    // Marcar el statement como fallido con mensaje genérico
    await supabaseAdmin
      .from('bank_statements')
      .update({
        status: 'failed',
        error_message: 'No se pudo procesar el extracto. Verificá que el PDF es legible.',
      })
      .eq('id', statementId);
  }
}

// ============================================================
// GET /api/module1/:id — Obtener estado y movimientos
// ============================================================
module1Router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: statement } = await supabaseAdmin
      .from('bank_statements')
      .select(`
        id, file_name, bank_detected, period_from, period_to,
        account_number, status, error_message, created_at,
        clients!inner(firm_id)
      `)
      .eq('id', id)
      .eq('clients.firm_id', req.user!.firmId)
      .single();

    if (!statement) {
      throw new AppError(404, 'Extracto no encontrado');
    }

    // Solo incluir transacciones si el procesamiento terminó
    let transactions = null;
    if (statement.status === 'completed') {
      const { data } = await supabaseAdmin
        .from('statement_transactions')
        .select('id, txn_date, description, debit, credit, balance')
        .eq('statement_id', id)
        .order('txn_date', { ascending: true });
      transactions = data;
    }

    res.status(200).json({
      statement: {
        id: statement.id,
        fileName: statement.file_name,
        bankDetected: statement.bank_detected,
        periodFrom: statement.period_from,
        periodTo: statement.period_to,
        accountNumber: statement.account_number,
        status: statement.status,
        errorMessage: statement.error_message,
        createdAt: statement.created_at,
      },
      transactions,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/module1/:id/export — Descargar Excel
// ============================================================
module1Router.get('/:id/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Verificar acceso y estado
    const { data: statement } = await supabaseAdmin
      .from('bank_statements')
      .select('id, file_name, bank_detected, period_from, period_to, status, clients!inner(firm_id)')
      .eq('id', id)
      .eq('clients.firm_id', req.user!.firmId)
      .single();

    if (!statement) throw new AppError(404, 'Extracto no encontrado');
    if (statement.status !== 'completed') {
      throw new AppError(400, 'El extracto aún no terminó de procesarse');
    }

    const { data: transactions } = await supabaseAdmin
      .from('statement_transactions')
      .select('txn_date, description, debit, credit, balance')
      .eq('statement_id', id)
      .order('txn_date', { ascending: true });

    if (!transactions || transactions.length === 0) {
      throw new AppError(404, 'No hay movimientos para exportar');
    }

    // Generar Excel
    const xlsxBuffer = await excelService.generateBankStatement(
      transactions,
      {
        bankName: statement.bank_detected ?? 'Banco',
        periodFrom: statement.period_from,
        periodTo: statement.period_to,
        fileName: statement.file_name,
      }
    );

    // Registrar exportación en audit_log ANTES de enviar el archivo
    await auditService.log({
      userId: req.user!.id,
      firmId: req.user!.firmId,
      action: 'export_excel',
      resourceType: 'bank_statement',
      resourceId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const exportFileName = `orvio_extracto_${id.slice(0, 8)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFileName}"`);
    res.setHeader('Content-Length', xlsxBuffer.length);
    res.status(200).send(xlsxBuffer);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/module1/client/:clientId — Listar extractos de un cliente
// ============================================================
module1Router.get('/client/:clientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId } = req.params;

    // Verificar que el cliente pertenece al tenant
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('firm_id', req.user!.firmId)
      .single();

    if (!client) throw new AppError(404, 'Cliente no encontrado');

    const { data: statements } = await supabaseAdmin
      .from('bank_statements')
      .select('id, file_name, bank_detected, period_from, period_to, status, created_at, users(full_name, email)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50);

    res.status(200).json({ statements: statements ?? [] });
  } catch (err) {
    next(err);
  }
});
