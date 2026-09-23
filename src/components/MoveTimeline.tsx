import { useEffect, useRef, type ReactNode } from "react";
import type { MoveClassification } from "@/lib/chess/classification";
import { qualityBand, type MoveAssessment } from "@/lib/chess/review";

/**
 * MoveTimeline (brief §21) — the game as a scrubbable instrument.
 *
 * Two synchronised views over the same plies:
 *  - a quality track where each ply is one bar coloured by classification
 *    (this is the "heat" of the game at a glance), and
 *  - the move chips themselves, grouped by move number, with classification
 *    glyphs and a marker on critical plies.
 *
 * Both respond to hover, tap, keyboard (the host page owns ←/→) and swipe, and
 * the active ply scrolls itself into view.
 */

const GLYPH: Record<MoveClassification, { glyph: string; cls: string; title: string }> = {
  best: { glyph: "★", cls: "g-best", title: "Best move" },
  excellent: { glyph: "✓", cls: "g-good", title: "Excellent" },
  good: { glyph: "·", cls: "g-good", title: "Good" },
  book: { glyph: "⌂", cls: "g-good", title: "Opening theory" },
  forced: { glyph: "→", cls: "g-good", title: "Forced" },
  "only-move": { glyph: "→", cls: "g-good", title: "Only move" },
  inaccuracy: { glyph: "?!", cls: "g-warn", title: "Inaccuracy" },
  mistake: { glyph: "?", cls: "g-warn", title: "Mistake" },
  blunder: { glyph: "??", cls: "g-bad", title: "Blunder" },
  "missed-opportunity": { glyph: "∞", cls: "g-bad", title: "Missed opportunity" },
};

export type MoveTimelineProps = {
  moves: MoveAssessment[];
  /** Fallback when a game has no review yet. */
  sans?: string[];
  currentPly: number;
  onSelect: (ply: number) => void;
  /** Plies to mark as critical. */
  criticalPlies?: number[];
  /** Show the quality track above the chips. */
  showTrack?: boolean;
};

export default function MoveTimeline({
  moves,
  sans,
  currentPly,
  onSelect,
  criticalPlies = [],
  showTrack = true,
}: MoveTimelineProps): ReactNode {
  const activeRef = useRef<HTMLButtonElement>(null);
  const critical = new Set(criticalPlies);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentPly]);

  const plies = moves.length > 0 ? moves : null;

  if (plies === null && (!sans || sans.length === 0)) {
    return <p className="faint small">No moves yet.</p>;
  }

  const count = plies ? plies.length : (sans?.length ?? 0);
  const cpLossMax = plies ? Math.max(1, ...plies.map((move) => Math.min(move.cpLoss, 600))) : 1;

  return (
    <div className="mtl">
      {showTrack && (
        <div
          className="mtl-track"
          role="group"
          aria-label="Move quality track"
        >
          {Array.from({ length: count }, (_, index) => {
            const move = plies?.[index];
            const ply = index + 1;
            const band = move ? qualityBand(move.classification) : "none";
            const severity = move ? Math.min(move.cpLoss, 600) / cpLossMax : 0.18;
            return (
              <button
                key={ply}
                type="button"
                className="mtl-ply"
                data-q={band === "none" ? undefined : band}
                data-critical={critical.has(ply) ? "1" : undefined}
                aria-current={currentPly === ply}
                aria-label={
                  move
                    ? `Ply ${ply}, ${move.san}, ${move.classification}`
                    : `Ply ${ply}, ${sans?.[index] ?? ""}`
                }
                title={
                  move
                    ? `${Math.ceil(ply / 2)}${ply % 2 ? "." : "…"} ${move.san} — ${move.classification}`
                    : `${Math.ceil(ply / 2)}${ply % 2 ? "." : "…"} ${sans?.[index] ?? ""}`
                }
                style={{ height: `${28 + severity * 72}%` }}
                onClick={() => onSelect(ply)}
              />
            );
          })}
        </div>
      )}

      <div className="mtl-moves" role="group" aria-label="Moves">
        {Array.from({ length: count }, (_, index) => {
          const ply = index + 1;
          const move = plies?.[index];
          const san = move?.san ?? sans?.[index] ?? "";
          const active = currentPly === ply;
          const info = move ? GLYPH[move.classification] : null;
          return (
            <button
              key={ply}
              ref={active ? activeRef : undefined}
              type="button"
              className="mtl-move"
              aria-current={active}
              data-critical={critical.has(ply) ? "1" : undefined}
              onClick={() => onSelect(ply)}
            >
              {ply % 2 === 1 && <span className="no">{Math.ceil(ply / 2)}.</span>}
              <span className={move && move.mover === "w" ? "mv-w" : "mv-b"}>{san}</span>
              {info && (
                <span className={`g ${info.cls}`} title={info.title}>
                  {info.glyph}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
