import { EmptyState } from "@/components/cards";
import { navigate } from "@/lib/router";

/**
 * Training (spec §35–38, §94) — Phase 7 delivers the training engine.
 * Phase 1 ships an honest empty state (no broken buttons).
 */
export default function TrainingPage() {
  return (
    <div className="stack">
      <h1>Training</h1>
      <EmptyState glyph="◎" title="Your training plan will appear here">
        <p>
          Starting in Phase 7: puzzles generated from your own mistakes, spaced repetition
          (failures come back sooner), fork/pin/skewer drills, opening repertoire reps and a
          daily plan built from your evidence.
        </p>
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 12 }}>
          <button className="btn" onClick={() => navigate("/games")}>
            Import games first
          </button>
          <button className="btn ghost" onClick={() => navigate("/board")}>
            Practice on the board
          </button>
        </div>
      </EmptyState>
    </div>
  );
}
