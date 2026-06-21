'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  Shield, 
  Users, 
  History, 
  Loader2, 
  AlertCircle, 
  Globe, 
  Terminal,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';
import DashboardLayout from '../dashboard/layout';

interface UserItem {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin_estudio' | 'contador' | 'auxiliar_contable';
  is_active: boolean;
  last_login_at: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  resource_type: string | null;
  ip_address: string | null;
  timestamp: string;
  details: Record<string, any> | null;
  users: {
    email: string;
    full_name: string | null;
  } | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [profile, setProfile] = useState<{ role: string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Users tab states
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Audit logs tab states
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const supabase = createClient();

  // 1. Check user profile and role
  useEffect(() => {
    async function checkRole() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/login');
          return;
        }

        const { data: profileData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        setProfile(profileData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProfile(false);
      }
    }
    checkRole();
  }, [router, supabase]);

  // 2. Fetch study users list
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('firm_id')
        .eq('id', user.id)
        .single();

      if (userData?.firm_id) {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, full_name, role, is_active, last_login_at')
          .eq('firm_id', userData.firm_id)
          .order('full_name', { ascending: true });

        if (error) throw error;
        setUsersList(data as UserItem[] || []);
      }
    } catch (err) {
      console.error('Error fetching users', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [supabase]);

  // 3. Fetch audit logs from backend API
  const loadAuditLogs = useCallback(async (page: number) => {
    setLoadingLogs(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/audit?page=${page}&limit=15`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) throw new Error('Error al cargar auditoría');
      const data = await res.json();
      setAuditLogs(data.logs || []);
      setTotalPages(data.pagination?.pages || 1);
    } catch (err) {
      console.error('Error loading audit logs', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [supabase]);

  // Load content based on active tab
  useEffect(() => {
    if (profile?.role === 'admin_estudio') {
      if (activeTab === 'users') {
        loadUsers();
      } else if (activeTab === 'audit') {
        loadAuditLogs(currentPage);
      }
    }
  }, [activeTab, profile, currentPage, loadUsers, loadAuditLogs]);

  if (loadingProfile) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  // Access Denied screen for non-admins
  if (profile?.role !== 'admin_estudio') {
    return (
      <DashboardLayout>
        <div className="card max-w-xl mx-auto flex flex-col items-center text-center border-slate-800 bg-slate-900/40 py-16 animate-fade-in">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-white">Acceso Restringido</h2>
          <p className="text-slate-400 text-sm mt-2 max-w-md">
            Esta sección solo está disponible para usuarios con rol de Administrador de Estudio (<span className="font-mono font-semibold text-slate-300 text-xs">admin_estudio</span>).
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const roleLabels: Record<string, string> = {
    admin_estudio: 'Administrador',
    contador: 'Contador Principal',
    auxiliar_contable: 'Auxiliar Contable',
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'login': return 'Inicio de sesión';
      case 'logout': return 'Cierre de sesión';
      case 'login_failed': return 'Intento fallido de login';
      case 'client_created': return 'Cliente creado';
      case 'client_updated': return 'Cliente modificado';
      case 'statement_uploaded': return 'Extracto subido';
      case 'statement_processed': return 'Extracto procesado';
      case 'entries_uploaded': return 'Asientos cargados';
      case 'report_generated': return 'Reporte generado';
      case 'export_excel': return 'Exportó Excel';
      case 'export_pdf': return 'Exportó PDF';
      case 'user_created': return 'Usuario creado';
      case 'user_updated': return 'Usuario modificado';
      case 'mfa_enabled': return 'Habilitó MFA';
      case 'mfa_disabled': return 'Deshabilitó MFA';
      default: return action;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in select-none">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-500" />
            Panel de Administración
          </h1>
          <p className="text-slate-400 text-sm mt-1.5">Control de seguridad, auditoría e integrantes del estudio contable.</p>
        </div>

        {/* Tabs navigation */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm cursor-pointer border-b-2 transition-all ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Usuarios del Estudio
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm cursor-pointer border-b-2 transition-all ${
              activeTab === 'audit'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            Registro de Auditoría (Logs)
          </button>
        </div>

        {/* Tab 1: Study Users */}
        {activeTab === 'users' && (
          <div className="card border-slate-800 bg-slate-900/40">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-white text-lg">Integrantes Registrados</h3>
              <span className="badge badge-primary text-[10px]">Total: {usersList.length}</span>
            </div>

            {loadingUsers ? (
              <div className="space-y-3">
                <div className="h-12 skeleton" />
                <div className="h-12 skeleton" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nombre Completo</th>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      <th>Último Ingreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((user) => (
                      <tr key={user.id} className="border-slate-850/80">
                        <td className="font-semibold text-white">{user.full_name || 'Sin nombre'}</td>
                        <td className="text-slate-300 font-mono text-xs">{user.email}</td>
                        <td>
                          <span className="badge badge-neutral text-xs">
                            {roleLabels[user.role] || user.role}
                          </span>
                        </td>
                        <td>
                          {user.is_active ? (
                            <span className="badge badge-success text-[10px]">Activo</span>
                          ) : (
                            <span className="badge badge-danger text-[10px]">Suspendido</span>
                          )}
                        </td>
                        <td className="text-slate-400 text-xs">
                          {user.last_login_at
                            ? new Date(user.last_login_at).toLocaleString('es-AR')
                            : 'Nunca registrado'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Audit Logs */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            {/* Security Notice */}
            <div className="disclaimer border-blue-900/50 bg-blue-950/20 text-blue-400">
              <Info className="w-5 h-5 shrink-0" />
              <div>
                <span className="font-bold block mb-0.5">Integridad de Auditoría Garantizada</span>
                <span>
                  Este registro es append-only e inmutable. Utiliza firma criptográfica hash-chaining (SHA-256) vinculada al bloque anterior. Cualquier intento de modificación o borrado de estos registros invalidará la integridad de la cadena.
                </span>
              </div>
            </div>

            {/* Logs Table */}
            <div className="card border-slate-800 bg-slate-900/40">
              {loadingLogs ? (
                <div className="space-y-3 py-10">
                  <div className="h-10 skeleton" />
                  <div className="h-10 skeleton" />
                  <div className="h-10 skeleton" />
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">No se encontraron registros de auditoría.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Fecha y Hora</th>
                          <th>Acción</th>
                          <th>Usuario</th>
                          <th>IP Origen</th>
                          <th>Detalles Adicionales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="border-slate-850/80 text-xs">
                            <td className="text-slate-400 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString('es-AR')}
                            </td>
                            <td>
                              <span className={`badge font-semibold ${
                                log.action.includes('failed') ? 'badge-danger' : 'badge-primary'
                              }`}>
                                {getActionLabel(log.action)}
                              </span>
                            </td>
                            <td className="text-white">
                              {log.users?.full_name || log.users?.email || 'Sistema (Background)'}
                            </td>
                            <td className="text-slate-400 font-mono">{log.ip_address || 'N/D'}</td>
                            <td className="text-slate-300 font-mono text-[10px] max-w-xs truncate" title={JSON.stringify(log.details)}>
                              {log.details ? JSON.stringify(log.details) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination control */}
                  {totalPages > 1 && (
                    <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1 || loadingLogs}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </button>
                      <span className="text-xs text-slate-500 font-medium">Página {currentPage} de {totalPages}</span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || loadingLogs}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        Siguiente <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
