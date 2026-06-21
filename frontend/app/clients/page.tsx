'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  Users, 
  Search, 
  Plus, 
  FileText, 
  AlertTriangle, 
  Loader2, 
  X, 
  Check, 
  ChevronRight,
  Shield
} from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '../dashboard/layout';

interface ClientData {
  id: string;
  name: string;
  cuit: string | null;
  is_active: boolean;
  created_at: string;
}

function ClientsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenNew = searchParams.get('action') === 'new';

  const [clients, setClients] = useState<ClientData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientCuit, setClientCuit] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const supabase = createClient();

  useEffect(() => {
    if (shouldOpenNew) {
      setIsModalOpen(true);
    }
  }, [shouldOpenNew]);

  useEffect(() => {
    async function loadClients() {
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

        // Fetch clients
        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id, name, cuit, is_active, created_at')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (clientsError) throw clientsError;
        setClients(clientsData || []);
      } catch (err) {
        console.error('Error loading clients', err);
      } finally {
        setLoading(false);
      }
    }

    loadClients();
  }, [supabase]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    // CUIT regex validation: XX-XXXXXXXX-X
    const cuitRegex = /^\d{2}-\d{8}-\d$/;
    if (clientCuit && !cuitRegex.test(clientCuit)) {
      setError('Format de CUIT inválido. Debe tener guiones (ej. 20-12345678-9)');
      setSaving(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Get user's firm ID
      const { data: profile } = await supabase
        .from('users')
        .select('firm_id')
        .eq('id', user.id)
        .single();

      if (!profile?.firm_id) throw new Error('No se pudo encontrar el estudio asociado');

      // Call API backend to log audit action, or insert directly
      // Since public.clients has RLS, frontend inserts will trigger clients_insert_contador_or_admin policy
      // RLS policy checks firm_id matches get_my_firm_id() and role is admin_estudio or contador
      const { data: newClient, error: insertError } = await supabase
        .from('clients')
        .insert({
          firm_id: profile.firm_id,
          name: clientName,
          cuit: clientCuit || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Log in backend audit
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/clients`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ name: clientName, cuit: clientCuit }),
          });
        }
      } catch (e) {
        console.error('Failed to report backend client created audit log', e);
      }

      setSuccess('Cliente creado correctamente');
      setClients([...clients, newClient].sort((a, b) => a.name.localeCompare(b.name)));
      setTimeout(() => {
        setIsModalOpen(false);
        setClientName('');
        setClientCuit('');
        setSuccess('');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Error al crear el cliente');
    } finally {
      setSaving(false);
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.cuit && c.cuit.includes(searchTerm))
  );

  const canCreateClient = userRole === 'admin_estudio' || userRole === 'contador';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-40 skeleton" />
          <div className="h-10 w-32 skeleton" />
        </div>
        <div className="h-12 w-full skeleton" />
        <div className="space-y-3">
          <div className="h-16 w-full skeleton" />
          <div className="h-16 w-full skeleton" />
          <div className="h-16 w-full skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Clientes</h1>
          <p className="text-slate-400 text-sm mt-1.5">Gestioná los clientes del estudio y sus respectivas conciliaciones.</p>
        </div>
        
        {canCreateClient && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl cursor-pointer shadow-lg shadow-blue-600/10 active:scale-[0.98] transition-all"
          >
            <Plus className="w-5 h-5" />
            Nuevo Cliente
          </button>
        )}
      </div>

      {/* Filter and Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nombre o CUIT..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900/40 border border-slate-800 focus:border-blue-500/80 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all"
        />
      </div>

      {/* Clients list */}
      {filteredClients.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="font-semibold text-white">No se encontraron clientes</h3>
          <p className="text-slate-500 text-sm mt-1">
            {searchTerm ? 'Intentá con otra búsqueda' : 'Comenzá agregando el primer cliente del estudio'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredClients.map((client) => (
            <div 
              key={client.id}
              className="card flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-slate-800 bg-slate-900/20 hover:bg-slate-900/30 transition-all p-5"
            >
              <div className="space-y-1">
                <span className="block text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                  {client.name}
                </span>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>CUIT: {client.cuit || 'N/D'}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                  <span>Alta: {new Date(client.created_at).toLocaleDateString('es-AR')}</span>
                </div>
              </div>

              {/* Action routes */}
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/clients/${client.id}/module1`}
                  className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700/80 text-blue-400 hover:text-blue-300 font-semibold py-2 px-3.5 rounded-lg text-xs transition-all border border-slate-750"
                >
                  <FileText className="w-4 h-4" />
                  Extracción PDF (M1)
                </Link>
                
                <Link
                  href={`/clients/${client.id}/module2`}
                  className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700/80 text-amber-400 hover:text-amber-300 font-semibold py-2 px-3.5 rounded-lg text-xs transition-all border border-slate-750"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Detección Desvíos (M2)
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-500" />
              Alta de Nuevo Cliente
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Ingresá los datos del cliente para agregarlo al estudio contable.
            </p>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-950/40 border border-red-500/30 rounded-xl p-3 mb-4 text-xs text-red-300">
                <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 mb-4 text-xs text-emerald-300">
                <Check className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Razón Social / Nombre Comercial
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Empresa S.A."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/80 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-slate-600 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  CUIT (Opcional)
                </label>
                <input
                  type="text"
                  value={clientCuit}
                  onChange={(e) => setClientCuit(e.target.value)}
                  placeholder="30-12345678-9"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/80 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-slate-600 outline-none transition-all"
                />
                <span className="block text-[10px] text-slate-500 mt-1.5">Format: XX-XXXXXXXX-X con guiones</span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-850 hover:bg-slate-800 text-slate-300 font-semibold py-2 px-4 rounded-xl text-sm transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !clientName}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-600/10 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Registrar Cliente'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="h-8 w-40 skeleton" />
            <div className="h-10 w-32 skeleton" />
          </div>
          <div className="h-12 w-full skeleton" />
        </div>
      }>
        <ClientsContent />
      </Suspense>
    </DashboardLayout>
  );
}
