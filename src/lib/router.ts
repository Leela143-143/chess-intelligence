import { useCallback, useSyncExternalStore } from "react";

/**
 * Tiny hash router — no dependency, works offline, shareable URLs.
 * Routes: / , /board , /games , /game/:id , /training , /settings , /diagnostics
 */
function getHash(): string {
  const hash = window.location.hash;
  return hash.startsWith("#") ? hash.slice(1) : "/";
}

let listeners: Array<() => void> = [];

function emit(): void {
  for (const listener of listeners) listener();
}

// Keep the router in sync with real browser navigation: clicking href="#/..."
// links, back/forward buttons and manual hash edits all fire `hashchange`.
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", emit);
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, getHash, () => "/");
}

/**
 * Split "#/games?f=loss&q=sicilian" into its path and its parameters.
 * Pages receive the parsed params so deep links work (brief §39).
 */
export function splitRoute(route: string): { path: string; params: URLSearchParams } {
  const [path, query = ""] = route.split("?");
  return { path: path || "/", params: new URLSearchParams(query) };
}

/** Scroll to the top on a real route change (not on query-only changes). */
export function scrollToTop(): void {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function navigate(to: string): void {
  window.location.hash = to;
  emit();
}

export function useNavigate(): (to: string) => void {
  return useCallback((to: string) => navigate(to), []);
}

/** Match "/game/123" against pattern "/game/:id". */
export function matchRoute(
  route: string,
  pattern: string,
): Record<string, string> | null {
  const routeParts = route.split("?")[0]!.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (routeParts.length !== patternParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!;
    const r = routeParts[i]!;
    if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(r);
    else if (p !== r) return null;
  }
  return params;
}
