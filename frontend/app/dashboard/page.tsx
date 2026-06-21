'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  Users, 
  FileSpreadsheet, 
  AlertTriangle, 
  ArrowRight, 
  Plus, 
  Clock, 
  CheckCircle2, 
  XCircle,
  FileText
} from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  clientsCount: number;
  statementsCount: number;
  deviationsCount: number;
}

interface RecentStatement {
  id: string;
  file_name: string;
  bank_detected: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  client_name: string;
  client_id: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    clientsCount: 0,
    statementsCount: 0,
    deviationsCount: 0,
  });
  const [recentStatements, setRecentStatements] = useState<RecentStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  
  const supabase = createClient();

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user role
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        setUserRole(profile?.role || 'contador');

        // Load stats
        const { count: clientsCount } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true);

        const { count: statementsCount } = await supabase
          .from('bank_statements')
          .select('*', { count: 'exact', head: true });

        const { count: reportsCount } = await supabase
          .from('reconciliation_reports')
          .select('*', { count: 'exact', head: true });

        setStats({
          clientsCount: clientsCount || 0,
          statementsCount: statementsCount || 0,
          deviationsCount: reportsCount || 0,
        });

        // Load recent statements
        const { data: statements } = await supabase
          .from('bank_statements')
          .select(`
            id,
            file_name,
            bank_detected,
            status,
            created_at,
            clients (id, name)
          `)
          .order('created_at', { ascending: false })
          .limit(5);

        if (statements) {
          const formatted = statements.map((item: any) => ({
            id: item.id,
            file_name: item.file_name,
            bank_detected: item.bank_detected,
            status: item.status,
            created_at: item.created_at,
            client_name: item.clients?.name || 'Cliente Desconocido',
            client_id: item.clients?.id || '',
          }));
          setRecentStatements(formatted);
        }
      } catch (err) {
        console.error('Error loading dashboard data', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [supabase]);

  const getStatusBadge = (status: RecentStatement['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="badge badge-success">
            <CheckCircle2 className="w-3.5 h-3.5" /> Procesado
          </span>
        );
      case 'processing':
      case 'pending':
        return (
          <span className="badge badge-warning animate-pulse">
            <Clock className="w-3.5 h-3.5" /> Procesando
          </span>
        );
      case 'failed':
        return (
          <span className="badge badge-danger">
            <XCircle className="w-3.5 h-3.5" /> Fallido
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-60 skeleton" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-32 skeleton" />
          <div className="h-32 skeleton" />
          <div className="h-32 skeleton" />
        </div>
        <div className="h-64 skeleton" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in select-none">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Panel de Control</h1>
        <p className="text-slate-400 text-sm mt-1.5">Bienvenido. Centralizá tus operaciones contables y conciliaciones bancarias.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card flex items-center justify-between border-slate-800 bg-slate-900/40">
          <div>
            <span className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Clientes Activos</span>
            <span className="text-3xl font-bold text-white">{stats.clientsCount}</span>
            <Link href="/clients" className="flex items-center gap-1.5 text-xs text-blue-400 font-medium hover:text-blue-300 mt-2 transition-colors">
              Gestionar clientes <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="w-12 h-12 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="card flex items-center justify-between border-slate-800 bg-slate-900/40">
          <div>
            <span className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Extractos Procesados</span>
            <span className="text-3xl font-bold text-white">{stats.statementsCount}</span>
            <span className="block text-[11px] text-slate-500 mt-2">Extraídos y exportados a Excel</span>
          </div>
          <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
        </div>

        <div className="card flex items-center justify-between border-slate-800 bg-slate-900/40">
          <div>
            <span className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Informes de Desvíos</span>
            <span className="text-3xl font-bold text-white">{stats.deviationsCount}</span>
            <span className="block text-[11px] text-slate-500 mt-2">Comparaciones de saldos y registros</span>
          </div>
          <div className="w-12 h-12 bg-amber-600/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="bg-slate-900/25 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Acciones Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(userRole === 'admin_estudio' || userRole === 'contador') && (
            <Link
              href="/clients?action=new"
              className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 hover:border-blue-500/40 hover:bg-slate-850 rounded-xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-semibold text-white">Nuevo Cliente</span>
                  <span className="block text-xs text-slate-400">Dar de alta una nueva empresa en el estudio</span>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-blue-400 transition-colors" />
            </Link>
          )}

          <Link
            href="/clients"
            className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 hover:bg-slate-850 rounded-xl transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-sm font-semibold text-white">Subir Extracto / Conciliar</span>
                <span className="block text-xs text-slate-400">Ir a Clientes para procesar Módulos 1 y 2</span>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </Link>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card border-slate-800 bg-slate-900/40">
        <h2 className="text-lg font-bold text-white mb-6">Extractos Bancarios Recientes</h2>
        
        {recentStatements.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
            <p className="text-slate-400 text-sm">No se registraron extractos subidos recientemente.</p>
            <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs text-blue-400 font-medium hover:underline mt-2">
              Seleccionar un cliente para comenzar
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Archivo</th>
                  <th>Banco Detectado</th>
                  <th>Fecha de Carga</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {recentStatements.map((item) => (
                  <tr key={item.id} className="border-slate-800/60">
                    <td className="font-medium text-white">{item.client_name}</td>
                    <td className="text-slate-300 truncate max-w-xs">{item.file_name}</td>
                    <td className="text-slate-400">{item.bank_detected || 'Pendiente'}</td>
                    <td className="text-slate-400">
                      {new Date(item.created_at).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td>
                      {item.status === 'completed' ? (
                        <Link 
                          href={`/clients/${item.client_id}/module1?statementId=${item.id}`}
                          className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 hover:underline"
                        >
                          Ver movimientos <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500 font-medium">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
