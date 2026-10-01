import { Loader2 } from 'lucide-react';
import { Link } from 'react-router';

const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'border border-hairline bg-canvas text-ink hover:bg-tint',
  ghost: 'text-body hover:bg-tint hover:text-ink',
  danger: 'border border-hairline bg-canvas text-negative hover:border-negative hover:bg-negative hover:text-white',
};

const SIZES = {
  sm: 'h-8 gap-1.5 px-2.5 text-[13px] max-md:h-10',
  md: 'h-9 gap-2 px-3.5 text-sm max-md:h-10',
  icon: 'size-9 justify-center max-md:size-10',
  'icon-sm': 'size-7 justify-center max-md:after:absolute max-md:after:-inset-1.5',
};

const POSITIONED = /(^|\s)(absolute|fixed|sticky|relative)(\s|$)/;

export function buttonClass({ variant = 'secondary', size = 'md', className = '' } = {}) {
  const anchor = size === 'icon-sm' && !POSITIONED.test(className) ? 'relative' : '';
  return `inline-flex shrink-0 items-center rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${anchor} ${className}`;
}

export function Button({ variant, size, icon: Icon, loading = false, className, children, type = 'button', ...props }) {
  return (
    <button type={type} {...props} disabled={loading || props.disabled} className={buttonClass({ variant, size, className })}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, size = 'icon', variant = 'ghost', className, ...props }) {
  return (
    <button type="button" aria-label={label} title={label} {...props} className={buttonClass({ variant, size, className })}>
      <Icon className={size === 'icon-sm' ? 'size-3.5' : 'size-4'} aria-hidden />
    </button>
  );
}

export function ButtonLink({ to, variant, size, icon: Icon, className, children, ...props }) {
  return (
    <Link to={to} {...props} className={buttonClass({ variant, size, className })}>
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </Link>
  );
}
