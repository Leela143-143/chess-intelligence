import { useEffect, type ReactNode } from "react";

/**
 * BottomSheet (spec §60, §81) — mobile sheet with backdrop and safe-area
 * padding. On desktop (>= 900px) it renders inline in the document flow.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 900;

  if (isDesktop) {
    return <div className="card">{children}</div>;
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="handle" />
        <div className="sheet-head">
          <strong>{title}</strong>
          <button className="btn small ghost" onClick={onClose} aria-label="Close sheet">
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
