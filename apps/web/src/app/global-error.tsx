'use client';

import './globals.css';

/**
 * Boundary de erro raiz. Substitui o `_global-error` sintético do Next, que não
 * consegue ser pré-renderizado com os providers de contexto do workspace.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <main className="auth-shell" role="alert">
          <section className="auth-card">
            <h1>Algo deu errado</h1>
            <p className="auth-subtitle">
              Não foi possível carregar o workspace. Tente novamente; se o problema persistir, contate o suporte.
            </p>
            <button className="button primary" type="button" onClick={reset}>Tentar novamente</button>
          </section>
        </main>
      </body>
    </html>
  );
}
