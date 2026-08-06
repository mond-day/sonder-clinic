'use client';

import { useId, useState } from 'react';

export function StatusBadge({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple';
}) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </section>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
  sensitive = false,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  sensitive?: boolean;
}) {
  return (
    <section className={`panel ${sensitive ? 'sensitive' : ''} ${className}`.trim()}>
      {(title || actions) && (
        <header className="panel-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  meta,
  tone,
  icon,
  iconTone,
}: {
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  tone?: 'red' | 'green' | 'amber';
  icon?: React.ReactNode;
  iconTone?: 'red' | 'amber' | 'blue' | 'purple' | 'green';
}) {
  return (
    <article className="metric-card">
      <div>
        <div className="metric-card-label">{label}</div>
        <div className="metric-card-value">{value}</div>
        {meta ? <div className={`metric-card-meta ${tone ?? ''}`.trim()}>{meta}</div> : null}
      </div>
      {icon ? <div className={`stat-icon ${iconTone ?? ''}`.trim()} aria-hidden>{icon}</div> : null}
    </article>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Não foi possível carregar',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {onRetry ? (
        <button type="button" className="button soft" onClick={onRetry}>Tentar novamente</button>
      ) : null}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-line" />
      ))}
    </div>
  );
}

export function UnavailableFeature({
  title,
  description,
  contractHint,
}: {
  title: string;
  description: string;
  contractHint: string;
}) {
  return (
    <Panel title={title} description="Recurso previsto no workspace clínico">
      <div className="empty-state">
        <h3>Aguardando contrato de API</h3>
        <p>{description}</p>
        <p className="contract-hint">{contractHint}</p>
        <p className="muted-note">Detalhes em docs/api/pending-workspace-contracts.md</p>
      </div>
    </Panel>
  );
}

export function Disclosure({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <section className="disclosure">
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
      >
        <span><strong>{title}</strong>{description ? <small>{description}</small> : null}</span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open ? <div id={contentId} className="disclosure-content">{children}</div> : null}
    </section>
  );
}
