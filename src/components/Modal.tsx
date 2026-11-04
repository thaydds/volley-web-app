import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Card } from '@beachsports/components';
interface ModalProps {
  label: string;
  onCancel: () => void;
  children: ReactNode;
  testId: string;
  alert?: boolean;
  fullscreen?: boolean;
  initialFocus?: RefObject<HTMLButtonElement>;
}
/** App-owned dialog: DS has no dialog primitive. Native modality provides focus trap/inert. */
export function Modal({
  label,
  onCancel,
  children,
  testId,
  alert,
  fullscreen = false,
  initialFocus,
}: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const trigger = document.activeElement;
    const el = dialog.current;
    el?.showModal();
    initialFocus?.current?.focus();
    return () => {
      el?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [initialFocus]);
  return (
    <dialog
      ref={dialog}
      className={`app-dialog${fullscreen ? ' app-dialog--fullscreen' : ''}`}
      role={alert ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-label={label}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        cancel.current();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel.current();
        }
      }}
    >
      {fullscreen ? children : <Card>{children}</Card>}
    </dialog>
  );
}
