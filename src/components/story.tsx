import type { ReactNode } from "react";
import type { GameStory } from "@/lib/chess/review";
import type { ReplayState } from "./moment";

/**
 * GameStory (brief §22) — the game told as beats.
 * Every beat is deterministic; Gemma can later improve the wording only.
 */
export function GameStoryView({
  story,
  onJump,
}: {
  story: GameStory;
  onJump?: (ply: number) => void;
}): ReactNode {
  if (story.beats.length === 0) return null;

  return (
    <div className="stack tight">
      {story.beats.map((beat, index) => (
        <article className="beat" key={`${beat.label}-${index}`} data-tone={beat.tone}>
          <div className="row between wrap">
            <span className="beat-label">{beat.label}</span>
            {beat.ply !== undefined && onJump && (
              <button className="btn small ghost" onClick={() => onJump(beat.ply!)}>
                go to move
              </button>
            )}
          </div>
          <p className="beat-text">{beat.text}</p>
        </article>
      ))}
      <p className="small faint">
        Generated from engine facts and deterministic analysis — no language model was involved.
      </p>
    </div>
  );
}

/**
 * ReplayBar (brief §23) — cinematic replay controls with decision-point
 * awareness. The host page owns the ply; this only drives the clock.
 */
export function ReplayBar({
  state,
  totalPlies,
  onToggle,
  onSpeed,
  onStep,
  onAnswer,
}: {
  state: ReplayState;
  totalPlies: number;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
  onStep: (delta: number) => void;
  /** Called when the player accepts the replay prompt at a decision point. */
  onAnswer?: () => void;
}): ReactNode {
  return (
    <div className="stack tight">
      <div className="row between wrap">
        <div className="btn-row tight">
          <button className="btn small ghost" onClick={() => onStep(-1)} aria-label="Step back">
            ◀
          </button>
          <button className="btn primary small" onClick={onToggle}>
            {state.playing ? "❚❚ Pause" : "▶ Replay"}
          </button>
          <button className="btn small ghost" onClick={() => onStep(1)} aria-label="Step forward">
            ▶
          </button>
        </div>
        <div className="seg" role="group" aria-label="Replay speed">
          {[0.5, 1, 2].map((speed) => (
            <button
              key={speed}
              aria-pressed={state.speed === speed}
              onClick={() => onSpeed(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      <div className="progress" aria-hidden="true">
        <i style={{ width: `${totalPlies === 0 ? 0 : (state.ply / totalPlies) * 100}%` }} />
      </div>

      {state.atDecision && (
        <div className="moment-hero" role="status">
          <span className="moment-kicker">Decision point</span>
          <h3 className="display-m" style={{ margin: 0 }}>
            What would you play?
          </h3>
          <p className="small dim" style={{ margin: 0 }}>
            Replay has paused here because the engine found a large swing at this move. Play your
            move on the board, then continue.
          </p>
          <div className="btn-row">
            <button className="btn small primary" onClick={onAnswer}>
              Score my move
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
