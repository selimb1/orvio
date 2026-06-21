'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  Shield, 
  LayoutDashboard, 
  Users, 
  History, 
  LogOut, 
  User, 
  Loader2,
  Menu,
  X
} from 'lucide-react';
import Link from 'next/link';

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  firmId: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function fetchUser() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.replace('/login');
          return;
        }

        // Fetch user info from public.users
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, full_name, role, firm_id')
          .eq('id', user.id)
          .single();

        if (userError || !userData) {
          // Fallback to auth details if profile is not synced yet
          setProfile({
            id: user.id,
            email: user.email || '',
            fullName: user.user_metadata?.full_name || 'Usuario',
            role: 'contador',
            firmId: '',
          });
        } else {
          setProfile({
            id: userData.id,
            email: userData.email,
            fullName: userData.full_name || 'Usuario',
            role: userData.role,
            firmId: userData.firm_id,
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, [router, supabase]);

  const handleSignOut = async () => {
    // Calling backend logout to record in audit log, and then local sign out
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      }
    } catch (e) {
      console.error('Failed to log logout audit action', e);
    }
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-400 text-sm">Cargando panel...</p>
        </div>
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    admin_estudio: 'Administrador',
    contador: 'Contador',
    auxiliar_contable: 'Auxiliar',
  };

  const menuItems = [
    {
      name: 'Inicio',
      path: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin_estudio', 'contador', 'auxiliar_contable'],
    },
    {
      name: 'Clientes',
      path: '/clients',
      icon: Users,
      roles: ['admin_estudio', 'contador', 'auxiliar_contable'],
    },
    {
      name: 'Auditoría',
      path: '/admin',
      icon: History,
      roles: ['admin_estudio'],
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 shrink-0">
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-slate-800">
          <div className="w-9 h-9 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <span className="font-extrabold text-white text-lg tracking-tight">Orvio</span>
            <span className="block text-[10px] text-slate-500 font-medium">ESTUDIO CONTABLE</span>
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1.5">
          {menuItems
            .filter((item) => item.roles.includes(profile?.role || ''))
            .map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
        </nav>

        {/* User Card & Sign Out */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-3 px-2 py-2 mb-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold shrink-0 border border-slate-700">
              {profile?.fullName.charAt(0) || <User className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-white truncate">{profile?.fullName}</span>
              <span className="badge badge-primary text-[10px] scale-90 -translate-x-1 mt-0.5">
                {roleLabels[profile?.role || ''] || 'Usuario'}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 hover:border-red-900/50 hover:bg-red-950/20 text-slate-400 hover:text-red-400 text-sm font-medium cursor-pointer transition-all active:scale-[0.98]"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Sidebar - Mobile Navigation Trigger */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-lg flex items-center justify-center">
            <Shield className="w-4.5 h-4.5 text-blue-400" />
          </div>
          <span className="font-extrabold text-white tracking-tight">Orvio</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-xl text-slate-300 hover:text-white"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40" onClick={() => setSidebarOpen(false)}>
          <div className="w-64 max-w-[80vw] h-full bg-slate-900 border-r border-slate-800 flex flex-col pt-20" onClick={(e) => e.stopPropagation()}>
            <nav className="flex-1 py-6 px-4 space-y-1.5">
              {menuItems
                .filter((item) => item.roles.includes(profile?.role || ''))
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                          : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  );
                })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 hover:border-red-900/50 hover:bg-red-950/20 text-slate-400 hover:text-red-400 text-sm font-medium cursor-pointer transition-all"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content viewport */}
      <div className="flex-1 flex flex-col min-w-0 pt-16 md:pt-0">
        <main className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
