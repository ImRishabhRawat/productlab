import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router';

export function PageHeader({ title, description, meta, actions, back }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-1.5 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
            <ChevronLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-ink">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function FilterBar({ children, className = '' }) {
  return <div className={`mb-5 flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

export function Section({ title, description, actions, children, className = '', ...props }) {
  return (
    <section className={`mt-8 scroll-mt-20 ${className}`} {...props}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
