import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [layers, setLayers] = useState([]);
  const nextId = useRef(0);

  const push = useCallback((tone, message) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const addLayer = useCallback((el) => {
    setLayers((list) => [...list, el]);
    return () => setLayers((list) => list.filter((l) => l !== el));
  }, []);

  const api = useMemo(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message?.message ?? message ?? 'Something went wrong'),
      addLayer,
    }),
    [push, addLayer],
  );

  const viewport = (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-2 md:right-4 md:bottom-4 md:left-auto md:max-w-sm">
      {toasts.map((t) => (
        <div key={t.id} className="flex items-start gap-2.5 rounded-lg bg-dark px-3.5 py-2.5 text-[13px] text-canvas shadow-md">
          {t.tone === 'error' ? (
            <CircleAlert className="mt-px size-4 shrink-0 text-serious" aria-hidden />
          ) : (
            <CircleCheck className="mt-px size-4 shrink-0 text-good" aria-hidden />
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {layers.length ? createPortal(viewport, layers.at(-1)) : viewport}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function useToastLayer(ref, open) {
  const { addLayer } = useToast();
  useEffect(() => (open && ref.current ? addLayer(ref.current) : undefined), [open, ref, addLayer]);
}
