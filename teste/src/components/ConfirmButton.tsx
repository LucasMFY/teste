import {useEffect, useState} from 'react';
import type {ReactNode} from 'react';

/** Botão em dois toques: o primeiro pede confirmação, o segundo executa. */
export function ConfirmButton({children, confirmLabel = 'Confirmar?', onConfirm, className = 'btn danger'}: {
  children: ReactNode;
  confirmLabel?: string;
  onConfirm(): void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={className + (armed ? ' armed' : '')}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
