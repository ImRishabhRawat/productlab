import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const GUTTER = 16;

export function Popover({ trigger, children, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const { left, right } = el.getBoundingClientRect();
    const edge = document.documentElement.clientWidth - GUTTER;
    const shift = right > edge ? Math.max(edge - right, GUTTER - left) : Math.max(GUTTER - left, 0);
    el.style.translate = shift ? `${shift}px 0` : '';
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          ref={panel}
          className={`absolute top-full z-30 mt-1.5 max-w-[calc(100vw-2rem)] rounded-lg border border-hairline bg-canvas shadow-md ${align === 'right' ? 'right-0' : 'left-0'} ${className}`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}
