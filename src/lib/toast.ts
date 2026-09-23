import { useSyncExternalStore } from "react";

/**
 * Toast bus (brief §41) — microinteractions for meaningful events.
 * A module-level store so any module (import, review, training) can announce,
 * without threading callbacks through the component tree.
 */

export type ToastKind = "info" | "success" | "warn" | "error";

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  detail?: string;
};

let toasts: Toast[] = [];
let nextId = 1;
let listeners: Array<() => void> = [];

function emit(): void {
  for (const listener of listeners) listener();
}

export function pushToast(message: string, kind: ToastKind = "info", detail?: string): number {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { id, message, kind, ...(detail ? { detail } : {}) }];
  emit();
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismissToast(id), kind === "error" ? 5200 : 3400);
  }
  return id;
}

export function dismissToast(id: number): void {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

const EMPTY: Toast[] = [];

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
}
