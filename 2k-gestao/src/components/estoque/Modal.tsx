"use client";
import { useEffect, useRef, type ReactNode } from "react";

export default function Modal({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose}
      className="m-auto w-[calc(100%-1.5rem)] max-w-xl rounded-lg bg-white p-0 shadow-xl backdrop:bg-slate-900/50">
      <div className="max-h-[90vh] overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900">✕</button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
