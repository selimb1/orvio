import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { rbac } from '../middleware/rbac';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

export const auditRouter = Router();

auditRouter.use(authMiddleware);

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ============================================================
// GET /api/audit — Ver audit log (solo admin_estudio)
// ============================================================
auditRouter.get(
  '/',
  rbac('admin_estudio'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, action, userId, from, to } = querySchema.parse(req.query);
      const offset = (page - 1) * limit;

      let query = supabaseAdmin
        .from('audit_log')
        .select('id, user_id, action, resource_type, resource_id, ip_address, details, timestamp, users(email, full_name)', { count: 'exact' })
        .eq('firm_id', req.user!.firmId)
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) query = query.eq('action', action);
      if (userId) query = query.eq('user_id', userId);
      if (from) query = query.gte('timestamp', from);
      if (to) query = query.lte('timestamp', to);

      const { data, error, count } = await query;

      if (error) throw new AppError(500, 'Error al obtener el registro de auditoría');

      res.status(200).json({
        logs: data,
        pagination: {
          page,
          limit,
          total: count ?? 0,
          pages: Math.ceil((count ?? 0) / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
