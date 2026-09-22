/**
 * Game fingerprinting for import deduplication (spec §29).
 *
 * Fingerprint inputs: players, date, moves, result, time control,
 * provider ID when available. Deterministic FNV-1a over a normalized key —
 * no network, no external service.
 */

import type { PgnHeaders } from "./pgn";

export type FingerprintInput = {
  headers: PgnHeaders;
  uciList: string[];
  providerId?: string | null;
};

const EMPTY = "-";

function norm(value: string | undefined | null): string {
  if (!value) return EMPTY;
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 32-bit FNV-1a, returned as 8 hex chars; combined for 64 bits of entropy. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function gameFingerprint(input: FingerprintInput): string {
  const key = [
    "v1",
    input.providerId ?? EMPTY,
    norm(input.headers.white),
    norm(input.headers.black),
    norm(input.headers.date),
    norm(input.headers.result),
    norm(input.headers.timeControl),
    input.uciList.join(",") || EMPTY,
  ].join("|");

  // Two passes with different salts for a 64-bit-ish digest.
  return fnv1a(key) + fnv1a(`salt:${key}:${key.length}`);
}
