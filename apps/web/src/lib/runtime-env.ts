export type PublicEnvKey = 'NEXT_PUBLIC_API_URL' | 'NEXT_PUBLIC_APP_URL';

export type PublicEnv = {
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

declare global {
  interface Window {
    __ENV__?: PublicEnv;
  }
}

export function getPublicEnv(key: PublicEnvKey): string | undefined {
  if (typeof window !== 'undefined') {
    return window.__ENV__?.[key];
  }
  return process.env[key];
}

export function runtimeEnvScript(env: PublicEnv): string {
  const payload = JSON.stringify(env).replace(/</g, '\\u003c');
  return `window.__ENV__=${payload}`;
}
