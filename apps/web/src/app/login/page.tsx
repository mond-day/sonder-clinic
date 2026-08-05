'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
});

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
      return;
    }
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next?.startsWith('/') ? next : '/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand"><span className="brand-mark">S</span><div><strong>Sonder</strong><small>Clinic</small></div></div>
        <div><h1>Acesse sua conta</h1><p>Use suas credenciais para continuar.</p></div>
        <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label>Senha<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full" disabled={submitting}>{submitting ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}
