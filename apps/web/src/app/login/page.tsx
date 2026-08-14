'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { ClinicBrandMark, useClinicBranding } from '@/components/clinic-brand';
import { ApiError, api } from '@/lib/api';
import { brandDisplayName } from '@/lib/branding';

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
});

type LoginMode = 'login' | 'forgot' | 'reset' | 'invite';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get('resetToken') ?? '';
  const inviteToken = searchParams.get('inviteToken') ?? '';
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<LoginMode>(
    inviteToken ? 'invite' : resetToken ? 'reset' : 'login',
  );
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ name: string; email: string; organizationName: string } | null>(null);
  const branding = useClinicBranding(undefined, false);
  const brandName = brandDisplayName(branding);

  useEffect(() => {
    api.get<{ smtpConfigured: boolean }>('/auth/smtp-status')
      .then((result) => setSmtpConfigured(result.smtpConfigured))
      .catch(() => setSmtpConfigured(null));
  }, []);

  useEffect(() => {
    if (inviteToken) setMode('invite');
    else if (resetToken) setMode('reset');
  }, [inviteToken, resetToken]);

  useEffect(() => {
    if (!inviteToken) return;
    api.get<{ name: string; email: string; organizationName: string }>(`/auth/invitation?token=${encodeURIComponent(inviteToken)}`)
      .then((info) => setInviteInfo(info))
      .catch((cause) => {
        setInviteInfo(null);
        setError(cause instanceof ApiError ? cause.message : 'Convite inválido.');
      });
  }, [inviteToken]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
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

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    if (!z.string().email().safeParse(email).success) {
      setError('Informe um e-mail válido.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setMessage('Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.');
      setMode('login');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível solicitar a redefinição.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    if (password.length < 8) {
      setError('A senha deve ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token: resetToken, password });
      setMessage('Senha redefinida. Entre com a nova senha.');
      setMode('login');
      router.replace('/login');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    if (password.length < 8) {
      setError('A senha deve ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<{ email: string }>('/auth/accept-invitation', {
        token: inviteToken,
        password,
      });
      setMessage(`Conta ativada para ${result.email}. Entre com sua senha.`);
      setMode('login');
      router.replace('/login');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível aceitar o convite.');
    } finally {
      setSubmitting(false);
    }
  }

  const onSubmit = mode === 'login'
    ? submitLogin
    : mode === 'forgot'
      ? submitForgot
      : mode === 'invite'
        ? submitInvite
        : submitReset;

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <div className="brand login-brand">
        <ClinicBrandMark branding={branding} />
        <div>
          <strong>{brandName}</strong>
          <small>{branding?.subtitle?.trim() || 'Clinic'}</small>
        </div>
      </div>
      {mode === 'login' ? (
        <>
          <div><h1>Acesse sua conta</h1><p>Use suas credenciais para continuar.</p></div>
          <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
          <label>
            Senha
            <div className="password-field">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
          >
            Esqueci minha senha
          </button>
          {smtpConfigured === false ? (
            <p className="muted-note">A recuperação de senha por e-mail ainda não está disponível nesta clínica. Fale com o administrador.</p>
          ) : null}
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="muted-note" role="status">{message}</p>}
          <button className="button primary full" disabled={submitting}>{submitting ? 'Entrando…' : 'Entrar'}</button>
        </>
      ) : null}
      {mode === 'forgot' ? (
        <>
          <div>
            <h1>Esqueci minha senha</h1>
            <p>Informe seu e-mail para receber um link de redefinição, se o envio de e-mail estiver ativo nesta clínica.</p>
          </div>
          <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="muted-note" role="status">{message}</p>}
          <button className="button primary full" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar link'}
          </button>
          <button type="button" className="text-button" onClick={() => setMode('login')}>Voltar ao login</button>
        </>
      ) : null}
      {mode === 'reset' ? (
        <>
          <div><h1>Nova senha</h1><p>Defina uma senha com ao menos 8 caracteres.</p></div>
          <label>
            Nova senha
            <div className="password-field">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label>Confirmar senha<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="muted-note" role="status">{message}</p>}
          <button className="button primary full" disabled={submitting || !resetToken}>
            {submitting ? 'Salvando…' : 'Redefinir senha'}
          </button>
        </>
      ) : null}
      {mode === 'invite' ? (
        <>
          <div>
            <h1>Aceitar convite</h1>
            <p>
              {inviteInfo
                ? `${inviteInfo.name}, defina sua senha para entrar em ${inviteInfo.organizationName}.`
                : 'Defina sua senha para ativar o acesso.'}
            </p>
          </div>
          {inviteInfo ? (
            <label>E-mail<input value={inviteInfo.email} readOnly /></label>
          ) : null}
          <label>
            Senha
            <div className="password-field">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label>Confirmar senha<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="muted-note" role="status">{message}</p>}
          <button className="button primary full" disabled={submitting || !inviteToken}>
            {submitting ? 'Ativando…' : 'Ativar conta'}
          </button>
        </>
      ) : null}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login-page">
      <Suspense fallback={<div className="login-card"><p>Carregando…</p></div>}>
        <LoginForm />
      </Suspense>
      <nav className="login-legal">
        <Link href="/legal/privacidade">Política de Privacidade</Link>
        <Link href="/legal/uso">Termos de Uso</Link>
      </nav>
    </main>
  );
}
