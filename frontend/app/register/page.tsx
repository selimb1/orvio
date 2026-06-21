"use client";

import React, { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
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
// RegisterContent — contenido principal
// ============================================================
function RegisterContent() {
  const router = useRouter();

  const [firmName, setFirmName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!firmName.trim()) next.firmName = 'El nombre del estudio es requerido.';
    if (!fullName.trim()) next.fullName = 'Tu nombre completo es requerido.';
    if (!email.trim()) {
      next.email = 'El correo electrónico es requerido.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'Ingresá un correo electrónico válido.';
    }
    if (!password) {
      next.password = 'La contraseña es requerida.';
    } else if (password.length < 8) {
      next.password = 'La contraseña debe tener al menos 8 caracteres.';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Confirmá tu contraseña.';
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Las contraseñas no coinciden.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firmName: firmName.trim(),
            fullName: fullName.trim(),
            email: email.toLowerCase().trim(),
            password,
          }),
        });
      } catch {
        // Error de red: el fetch nunca completó (sin conexión, backend caído, CORS preflight bloqueado, etc.)
        throw new Error(
          'No pudimos conectarnos con el servidor. Verificá tu conexión o intentá de nuevo en unos minutos.'
        );
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la cuenta. Intentá nuevamente.');

      // Sincronizar sesión y redirigir al dashboard directamente
      await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setFormError(err.message || 'No se pudo crear la cuenta. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const setFieldError = (field: string, val: string) => {
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <main className="flex min-h-screen w-full bg-black selection:bg-white/30 p-2 transition-all duration-500 lg:h-screen lg:overflow-hidden lg:p-4 font-sans antialiased text-white select-none">
      <AuthHero
        title="Sumá tu estudio a Orvio"
        subtitle="Creá la cuenta de tu estudio contable y empezá a gestionar tus clientes."
      />

      {/* Columna derecha: formulario de registro */}
      <div className="flex-1 flex flex-col items-center justify-center py-12 lg:py-6 px-4 sm:px-12 lg:px-16 xl:px-24 overflow-y-auto lg:overflow-hidden bg-black">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="w-full max-w-xl space-y-8 sm:space-y-10 lg:space-y-6"
        >
          {/* Encabezado */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">Crear tu estudio</h1>
            <p className="text-white/40 text-sm">Completá estos datos para registrar tu estudio contable.</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nombre del estudio + Nombre completo (grid responsive) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputGroup
                label="Nombre del estudio"
                placeholder="Ej: Estudio Pérez & Asoc."
                type="text"
                value={firmName}
                onChange={(e) => { setFirmName(e.target.value); setFieldError('firmName', e.target.value); }}
                error={errors.firmName}
              />
              <InputGroup
                label="Nombre completo"
                placeholder="Tu nombre y apellido"
                type="text"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setFieldError('fullName', e.target.value); }}
                error={errors.fullName}
              />
            </div>

            <InputGroup
              label="Correo electrónico"
              placeholder="admin@estudio.com"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFieldError('email', e.target.value); }}
              error={errors.email}
            />

            <InputGroup
              label="Contraseña"
              placeholder="Mínimo 8 caracteres"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError('password', e.target.value); }}
              error={errors.password}
              showTogglePassword
              onTogglePassword={() => setShowPassword(v => !v)}
              isPasswordVisible={showPassword}
            />

            <InputGroup
              label="Confirmar contraseña"
              placeholder="Repetí tu contraseña"
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setFieldError('confirmPassword', e.target.value); }}
              error={errors.confirmPassword}
              showTogglePassword
              onTogglePassword={() => setShowConfirmPassword(v => !v)}
              isPasswordVisible={showConfirmPassword}
            />

            {formError && <p className="text-sm text-red-400">{formError}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Creando estudio…</>
              ) : 'Crear estudio'}
            </button>
          </form>

          {/* Link a login */}
          <p className="text-sm text-white/40 text-center">
            ¿Ya tenés cuenta?{' '}
            <Link href="/login" className="text-white font-medium hover:underline">
              Iniciá sesión
            </Link>
          </p>
        </motion.div>
      </div>
    </main>
  );
}

// ============================================================
// Página con Suspense
// ============================================================
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-black text-white">
          <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        </main>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
