import { NextResponse } from 'next/server';
import { omitSetupSecrets, resolveSetupApiBase } from '@/lib/setup-initialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'JSON inválido.' }, { status: 400, headers: noStore });
  }

  const payload = omitSetupSecrets(body);

  try {
    const response = await fetch(`${resolveSetupApiBase()}/setup/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const apiPayload = await response.json().catch(() => null);
    return NextResponse.json(
      apiPayload ?? { message: 'Não foi possível concluir o setup.' },
      { status: response.status, headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { message: 'A API ainda não está pronta. Aguarde o deploy e tente de novo.' },
      { status: 503, headers: noStore },
    );
  }
}
