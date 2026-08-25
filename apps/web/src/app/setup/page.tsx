'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ClinicBrandMark, ClinicBrandText, useClinicBranding } from '@/components/clinic-brand';
import { ApiError, api } from '@/lib/api';
import { toInitializeBody } from '@/lib/setup-initialize';

type SetupStatus = { required: boolean; state: 'EMPTY' | 'READY' | 'INCONSISTENT' };

const schema = z.object({
  clinicName: z.string().trim().min(2, 'Informe o nome da clínica.'),
  taxId: z.string().optional(),
  adminName: z.string().trim().min(2, 'Informe o nome do administrador.'),
  adminEmail: z.string().email('Informe um e-mail válido.'),
  adminPassword: z.string().min(10, 'A senha deve ter ao menos 10 caracteres, com maiúscula, minúscula e número.'),
  confirmPassword: z.string().min(10),
});

export default function SetupPage() {
  const router = useRouter();
  const branding = useClinicBranding(undefined, false);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<SetupStatus>('/setup/status')
      .then((result) => {
        setStatus(result);
        if (!result.required) router.replace('/login');
      })
      .catch(() => setError('Não foi possível consultar o status da instalação. Aguarde o sistema iniciar e recarregue.'));
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
      return;
    }
    if (parsed.data.adminPassword !== parsed.data.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toInitializeBody(parsed.data)),
      });
      const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
      if (!response.ok) {
        const detail = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
        throw new ApiError(detail ?? 'Não foi possível criar o primeiro usuário.', response.status);
      }
      router.replace('/login?setup=done');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o primeiro usuário.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!status) {
    return (
      <main className="login-page">
        <div className="login-card">
          <p>{error || 'Verificando instalação…'}</p>
        </div>
      </main>
    );
  }

  if (!status.required) {
    return (
      <main className="login-page">
        <div className="login-card"><p>Redirecionando para o login…</p></div>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="brand login-brand">
          <ClinicBrandMark branding={branding} />
          <ClinicBrandText branding={branding} fallbackSubtitle="Clinic" />
        </div>
        <div>
          <h1>Criar primeiro usuário</h1>
          <p>Esta instalação ainda não tem usuários. Informe a clínica e o administrador. Depois entre com esse e-mail e senha.</p>
        </div>
        <label>Nome da clínica<input name="clinicName" required minLength={2} autoComplete="organization" /></label>
        <label>CNPJ/CPF (opcional)<input name="taxId" /></label>
        <label>Nome do administrador<input name="adminName" required minLength={2} autoComplete="name" /></label>
        <label>E-mail<input name="adminEmail" type="email" required autoComplete="username" /></label>
        <label>Senha<input name="adminPassword" type="password" required minLength={10} autoComplete="new-password" /></label>
        <label>Confirmar senha<input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="login-actions">
          <button className="button primary full" disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar primeiro usuário'}
          </button>
        </div>
      </form>
      <nav className="login-legal">
        <Link href="/legal/privacidade">Política de Privacidade</Link>
        <Link href="/legal/uso">Termos de Uso</Link>
      </nav>
    </main>
  );
}
