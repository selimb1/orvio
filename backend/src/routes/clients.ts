import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { rbac } from '../middleware/rbac';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { auditService } from '../services/auditService';

export const clientsRouter = Router();

// Todos los endpoints requieren autenticación
clientsRouter.use(authMiddleware);

// ============================================================
// Schemas
// ============================================================
const CUIT_REGEX = /^\d{2}-\d{8}-\d$/;

const createClientSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(255).trim(),
  cuit: z.string().regex(CUIT_REGEX, 'CUIT inválido. Formato: XX-XXXXXXXX-X').optional(),
});

const updateClientSchema = createClientSchema.partial();

// ============================================================
// GET /api/clients — Listar clientes del estudio
// ============================================================
clientsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('id, name, cuit, is_active, created_at')
      .eq('firm_id', req.user!.firmId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw new AppError(500, 'Error al obtener clientes');

    res.status(200).json({ clients: data });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/clients/:id — Obtener cliente por ID
// ============================================================
clientsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('id, name, cuit, is_active, created_at, updated_at')
      .eq('id', id)
      .eq('firm_id', req.user!.firmId) // Asegurar que pertenece al mismo tenant
      .single();

    if (error || !data) {
      throw new AppError(404, 'Cliente no encontrado');
    }

    res.status(200).json({ client: data });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/clients — Crear cliente (solo contador o admin)
// ============================================================
clientsRouter.post(
  '/',
  rbac('admin_estudio', 'contador'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, cuit } = createClientSchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('clients')
        .insert({
          firm_id: req.user!.firmId,
          name,
          cuit: cuit ?? null,
          created_by: req.user!.id,
        })
        .select()
        .single();

      if (error) {
        throw new AppError(500, 'Error al crear el cliente');
      }

      await auditService.log({
        userId: req.user!.id,
        firmId: req.user!.firmId,
        action: 'client_created',
        resourceType: 'client',
        resourceId: data.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ client: data });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// PUT /api/clients/:id — Actualizar cliente (solo contador o admin)
// ============================================================
clientsRouter.put(
  '/:id',
  rbac('admin_estudio', 'contador'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updates = updateClientSchema.parse(req.body);

      // Verificar que el cliente pertenece al tenant
      const { data: existing } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('id', id)
        .eq('firm_id', req.user!.firmId)
        .single();

      if (!existing) {
        throw new AppError(404, 'Cliente no encontrado');
      }

      const { data, error } = await supabaseAdmin
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new AppError(500, 'Error al actualizar el cliente');

      await auditService.log({
        userId: req.user!.id,
        firmId: req.user!.firmId,
        action: 'client_updated',
        resourceType: 'client',
        resourceId: String(id),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({ client: data });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// DELETE /api/clients/:id — Soft delete (solo admin)
// ============================================================
clientsRouter.delete(
  '/:id',
  rbac('admin_estudio'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const { data: existing } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('id', id)
        .eq('firm_id', req.user!.firmId)
        .single();

      if (!existing) {
        throw new AppError(404, 'Cliente no encontrado');
      }

      // Soft delete: desactivar, no eliminar físicamente
      await supabaseAdmin
        .from('clients')
        .update({ is_active: false })
        .eq('id', id);

      await auditService.log({
        userId: req.user!.id,
        firmId: req.user!.firmId,
        action: 'client_updated',
        resourceType: 'client',
        resourceId: String(id),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { action: 'soft_delete' },
      });

      res.status(200).json({ message: 'Cliente desactivado correctamente' });
    } catch (err) {
      next(err);
    }
  }
);
