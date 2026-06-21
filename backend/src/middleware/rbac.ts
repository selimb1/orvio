import { Request, Response, NextFunction } from 'express';

type UserRole = 'admin_estudio' | 'contador' | 'auxiliar_contable';

/**
 * Middleware de autorización basado en roles (RBAC).
 * Usar después de authMiddleware.
 * 
 * Ejemplo de uso:
 *   router.get('/admin-only', authMiddleware, rbac('admin_estudio'), handler)
 *   router.get('/contadores', authMiddleware, rbac('admin_estudio', 'contador'), handler)
 */
export function rbac(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
      return;
    }

    next();
  };
}
