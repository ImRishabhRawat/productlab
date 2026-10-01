import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button.jsx';
import { useToastLayer } from './Toast.jsx';

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };
const FIRST_FIELD = ':scope > form :is(input:not([type=hidden]), select, textarea):not(:disabled)';

export function Modal({ open, onClose, title, description, size = 'md', onSubmit, footer, children }) {
  const ref = useRef(null);
  const pressed = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      (dialog.querySelector('[data-autofocus]') ?? dialog.querySelector(FIRST_FIELD))?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useToastLayer(ref, open);

  const onDialog = (e) => e.target === ref.current;
  const Body = onSubmit ? 'form' : 'div';
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        if (!onDialog(e)) return;
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        pressed.current = onDialog(e);
      }}
      onPointerUp={(e) => {
        pressed.current = pressed.current && onDialog(e);
      }}
      onClick={(e) => {
        if (pressed.current && onDialog(e)) onClose();
        pressed.current = false;
      }}
      className={`m-auto w-[calc(100%-2rem)] ${SIZES[size]} rounded-xl border border-hairline bg-canvas p-0 text-ink shadow-md`}
    >
      {open && (
        <Body
          className="flex max-h-[88vh] flex-col"
          {...(onSubmit && {
            noValidate: true,
            onSubmit: (e) => {
              e.preventDefault();
              onSubmit();
            },
          })}
        >
          <header className="flex items-start justify-between gap-4 border-b border-hairline-soft px-5 pt-4 pb-3">
            <div className="min-w-0">
              <h2 className="font-display text-[26px] leading-tight font-medium tracking-[-0.01em]">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <IconButton icon={X} label="Close" size="icon-sm" onClick={onClose} className="mt-1" />
          </header>
          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex items-center justify-end gap-2 border-t border-hairline-soft px-5 py-3">{footer}</footer>}
        </Body>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-body">{message}</p>
    </Modal>
  );
}
