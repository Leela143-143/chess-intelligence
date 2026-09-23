/**
 * Deterministic game metrics (spec §40, §95).
 *
 * Accuracy formula (documented, deterministic):
 *   per-move normalized loss = min(cpLoss, 500) / 500
 *   accuracy = 100 * (1 - mean(normalized losses)), clamped to [0, 100]
 *
 * cpLoss is measured in the mover's perspective from White-normalized evals.
 */

export const CP_LOSS_CAP = 500;

export function accuracyFromLosses(cpLosses: number[]): number {
  if (cpLosses.length === 0) return 0;
  const mean =
    cpLosses.reduce((sum, loss) => sum + Math.min(Math.max(loss, 0), CP_LOSS_CAP), 0) /
    cpLosses.length;
  return Math.max(0, Math.min(100, Math.round((1 - mean / CP_LOSS_CAP) * 1000) / 10));
}

export function acplFromLosses(cpLosses: number[]): number {
  if (cpLosses.length === 0) return 0;
  const total = cpLosses.reduce((sum, loss) => sum + Math.max(0, loss), 0);
  return Math.round(total / cpLosses.length);
}

export type MoveEvalPoint = {
  ply: number;
  moveSan: string;
  mover: "w" | "b";
  /** White-perspective eval before/after the move. */
  evalBeforeCp: number;
  evalBeforeMate: number | null;
  evalAfterCp: number;
  evalAfterMate: number | null;
  bestUci: string | null;
  playedUci: string;
};

export type CriticalMoment = {
  ply: number;
  moveSan: string;
  mover: "w" | "b";
  /** Loss in mover's perspective (cp). */
  cpLoss: number;
  kind:
    | "largest-swing"
    | "missed-mate"
    | "allowed-mate"
    | "material-loss"
    | "defensive-failure"
    // Phase 2.5: highlights join the same ranked list as errors.
    | "brilliant"
    | "exceptional";
};

function toCp(cp: number, mate: number | null): number {
  if (mate === null || mate === 0) return cp;
  const magnitude = 10_000 - Math.abs(mate) * 10;
  return mate > 0 ? magnitude : -magnitude;
}

/**
 * Identify and rank critical moments (spec §44).
 * A moment qualifies when the mover loses >= 150cp, or a mate appears/
 * disappears. Ranked by severity descending.
 */
export const CRITICAL_MOMENT_CP_THRESHOLD = 150;

export function findCriticalMoments(points: MoveEvalPoint[]): CriticalMoment[] {
  const moments: CriticalMoment[] = [];

  for (const point of points) {
    const before = toCp(point.evalBeforeCp, point.evalBeforeMate);
    const after = toCp(point.evalAfterCp, point.evalAfterMate);
    const beforeM = point.mover === "w" ? before : -before;
    const afterM = point.mover === "w" ? after : -after;
    const cpLoss = Math.round(beforeM - afterM);

    const hadMate = beforeM > 9000;
    const facedMate = beforeM < -9000;
    const allowedMate = afterM < -9000;

    let kind: CriticalMoment["kind"] | null = null;
    if (allowedMate && !facedMate) kind = "allowed-mate";
    else if (hadMate && afterM < 9000) kind = "missed-mate";
    else if (cpLoss >= CRITICAL_MOMENT_CP_THRESHOLD) {
      kind = cpLoss >= 400 ? "material-loss" : "largest-swing";
    }

    if (kind) {
      moments.push({
        ply: point.ply,
        moveSan: point.moveSan,
        mover: point.mover,
        cpLoss: Math.max(0, cpLoss),
        kind,
      });
    }
  }

  return moments.sort((a, b) => b.cpLoss - a.cpLoss);
}
