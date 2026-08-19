import { NextResponse } from 'next/server';
import { omitSetupSecrets, readSetupTokenHeader, resolveSetupApiBase } from '@/lib/setup-initialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const token = readSetupTokenHeader(request.headers.get('x-setup-token'));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'JSON inválido.' }, { status: 400, headers: noStore });
  }

  const payload = omitSetupSecrets(body);
  if (!token) {
    return NextResponse.json(
      { message: 'Informe o token de instalação.' },
      { status: 401, headers: noStore },
    );
  }

  try {
    const response = await fetch(`${resolveSetupApiBase()}/setup/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Setup-Token': token,
      },
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
