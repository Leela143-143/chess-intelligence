import { useMemo, useState } from "react";
import { coachController } from "@/lib/coach/controller";
import type { CoachContext, CoachRequest, CoachResponse } from "@/lib/coach/types";
import { PERSONALITIES } from "@/lib/coach/personalities";
import { useSettings } from "@/lib/settingsContext";

/**
 * CoachPanel (spec §18, §51–§55, §69–§72).
 *
 * Contextual coach actions over a structured context. The response badge
 * honestly reports the source: Local Gemma vs rule-based (deterministic)
 * vs unavailable. Never "AI says…" unless a model actually generated it.
 */

export type CoachAction = CoachRequest["action"];

const ACTIONS: Array<{ action: CoachAction; label: string }> = [
  { action: "explain-move", label: "Explain this move" },
  { action: "why-bad", label: "Why was this bad?" },
  { action: "better-move", label: "What should I have played?" },
  { action: "show-idea", label: "Show the idea" },
  { action: "explain-simply", label: "Explain simply" },
  { action: "explain-deeply", label: "Explain deeply" },
  { action: "practice-advice", label: "What should I practice?" },
];

export type CoachPanelProps = {
  context: CoachContext | null;
  /** Shown when no context is available yet. */
  emptyHint?: string;
};

const SOURCE_LABEL: Record<string, { text: string; cls: string }> = {
  "gemma-local": { text: "Local Gemma", cls: "gemma" },
  deterministic: { text: "Rule-based", cls: "deterministic" },
  unavailable: { text: "Local AI unavailable", cls: "unavailable" },
};

export default function CoachPanel({ context, emptyHint }: CoachPanelProps) {
  const { settings, update } = useSettings();
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState<string>("");
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const [freeform, setFreeform] = useState("");

  const personality = useMemo(
    () => PERSONALITIES.find((p) => p.id === settings.personalityId) ?? PERSONALITIES[0]!,
    [settings.personalityId],
  );

  const ask = async (action: CoachAction, question?: string) => {
    if (!context) return;
    setBusy(true);
    setResponse(null);
    setStreamed("");
    try {
      const result = await coachController.ask(
        {
          context,
          action,
          question,
          personalityId: settings.personalityId,
          targetLevel: settings.targetLevel,
        },
        (chunk) => setStreamed((current) => current + chunk),
      );
      setResponse(result);
      setStreamed("");
    } catch (error) {
      setResponse({
        text: error instanceof Error ? error.message : String(error),
        source: "unavailable",
        evidence: [],
        confidence: "low",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!context) {
    return (
      <div className="faint small">{emptyHint ?? "Select a position to ask the coach."}</div>
    );
  }

  const source = response ? SOURCE_LABEL[response.source] ?? SOURCE_LABEL.unavailable! : null;

  return (
    <div className="stack">
      <div className="row between wrap">
        <div className="seg" role="group" aria-label="Coach personality">
          {PERSONALITIES.slice(0, 5).map((p) => (
            <button
              key={p.id}
              className={p.id === personality.id ? "active" : ""}
              onClick={() => void update({ personalityId: p.id })}
              title={p.blurb}
            >
              {p.emoji}
            </button>
          ))}
        </div>
        <span className="small faint">
          {personality.name} · {settings.targetLevel}
        </span>
      </div>

      <div className="btn-row">
        {ACTIONS.map((item) => (
          <button
            key={item.action}
            className="btn small"
            disabled={busy}
            onClick={() => void ask(item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(busy || streamed) && (
        <div className="coach-response">
          <span className="small dim">
            {streamed ? "" : "Coach is thinking…"}
            {streamed}
            {streamed ? "▍" : ""}
          </span>
        </div>
      )}

      {response && source && (
        <div className="coach-response">
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className={`badge-source ${source.cls}`}>{source.text}</span>
            <span className="small faint">
              confidence: {response.confidence}
              {response.sampleSize !== undefined ? ` · n=${response.sampleSize}` : ""}
            </span>
          </div>
          {response.text}

          {response.evidence.length > 0 && (
            <div className="evidence" aria-label="Evidence">
              {response.evidence.map((item, i) => (
                <span className="ev" key={i}>
                  {item.detail}
                </span>
              ))}
            </div>
          )}

          {response.removedClaims && response.removedClaims.length > 0 && (
            <div className="removed-claims">
              ✦ {response.removedClaims.length} unsupported claim
              {response.removedClaims.length > 1 ? "s" : ""} removed by validation (the model
              cannot cite facts that are not in the engine data).
            </div>
          )}
        </div>
      )}

      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          const question = freeform.trim();
          if (!question) return;
          setFreeform("");
          void ask("freeform", question);
        }}
      >
        <input
          type="text"
          value={freeform}
          placeholder="Ask about this position…"
          onChange={(event) => setFreeform(event.target.value)}
          aria-label="Ask the coach"
        />
        <button className="btn small primary" type="submit" disabled={busy || !freeform.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
