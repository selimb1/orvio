"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AuthHero from '@/app/components/AuthHero';

// ============================================================
// InputGroup — Componente reutilizable
// ============================================================
interface InputGroupProps {
  label: string;
  placeholder: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  showTogglePassword?: boolean;
  onTogglePassword?: () => void;
  isPasswordVisible?: boolean;
}

function InputGroup({
  label,
  placeholder,
  type,
  value,
  onChange,
  error,
  showTogglePassword,
  onTogglePassword,
  isPasswordVisible,
}: InputGroupProps) {
  const inputType = showTogglePassword && isPasswordVisible ? 'text' : type;

  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-sm font-medium text-white">{label}</label>
      <div className="relative w-full">
        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="w-full bg-brand-gray border-none rounded-xl h-11 px-4 pr-12 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 outline-none transition-all"
        />
        {showTogglePassword && onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer"
          >
            {isPasswordVisible ? (
              <EyeOff className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

// ============================================================
// LoginContent — contenido principal
// ============================================================
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.signOut().catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }, [supabase]);

  const validateEmail = (val: string): boolean => {
    if (!val) { setEmailError('El correo electrónico es requerido.'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setEmailError('Ingresá un correo electrónico válido.'); return false; }
    setEmailError('');
    return true;
  };

  const validatePassword = (val: string): boolean => {
    if (!val) { setPasswordError('La contraseña es requerida.'); return false; }
    if (val.length < 8) { setPasswordError('La contraseña debe tener al menos 8 caracteres.'); return false; }
    setPasswordError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const lowerEmail = email.toLowerCase().trim();
    if (!validateEmail(lowerEmail) || !validatePassword(password)) return;

    setLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: lowerEmail, password }),
        });
      } catch {
        // Error de red: el fetch nunca completó (sin conexión, backend caído, CORS preflight bloqueado, etc.)
        throw new Error(
          'No pudimos conectarnos con el servidor. Verificá tu conexión o intentá de nuevo en unos minutos.'
        );
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credenciales inválidas. Intentá nuevamente.');

      await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setFormError(err.message || 'Credenciales inválidas. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full bg-black selection:bg-white/30 p-2 transition-all duration-500 lg:h-screen lg:overflow-hidden lg:p-4 font-sans antialiased text-white select-none">
      <AuthHero
        title="Bienvenido a Orvio"
        subtitle="La plataforma contable para estudios profesionales en Argentina."
      />

      {/* Columna derecha: formulario */}
      <div className="flex-1 flex flex-col items-center justify-center py-12 lg:py-6 px-4 sm:px-12 lg:px-16 xl:px-24 overflow-y-auto lg:overflow-hidden bg-black">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="w-full max-w-xl space-y-8 sm:space-y-10 lg:space-y-6"
        >
          {/* Encabezado */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">Iniciar sesión</h1>
            <p className="text-white/40 text-sm">Ingresá tus credenciales para acceder a tu estudio.</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <InputGroup
              label="Correo electrónico"
              placeholder="nombre@estudio.com"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value); }}
              error={emailError}
            />
            <InputGroup
              label="Contraseña"
              placeholder="Ingresá tu contraseña"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (passwordError) validatePassword(e.target.value); }}
              error={passwordError}
              showTogglePassword
              onTogglePassword={() => setShowPassword(v => !v)}
              isPasswordVisible={showPassword}
            />

            {formError && <p className="text-sm text-red-400">{formError}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Iniciando sesión…</>
              ) : 'Iniciar sesión'}
            </button>
          </form>

          {/* Links auxiliares */}
          <div className="flex flex-col items-center gap-4">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-sm text-white/40 hover:text-white transition-colors duration-150"
            >
              ¿Olvidaste tu contraseña?
            </a>
            <p className="text-sm text-white/40 text-center">
              ¿No tenés cuenta?{' '}
              <Link href="/register" className="text-white font-medium hover:underline">
                Registrate
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

// ============================================================
// Página con Suspense (requerido por useSearchParams)
// ============================================================
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-black text-white">
          <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
