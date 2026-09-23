import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePlayer } from "@/lib/player/context";
import { useEngine } from "@/lib/engineContext";
import { db, type TrainingItem } from "@/lib/db/schema";
import {
  buildDailyMission,
  scheduleNext,
  type MissionBlock,
  type SrsGrade,
} from "@/lib/training/engine";
import TrainingSession from "@/components/TrainingSession";
import { Reveal } from "@/components/ambient";
import { navigate } from "@/lib/router";
import { pushToast } from "@/lib/toast";
import type { EngineEvaluation } from "@/lib/engine/types";

/**
 * Training hub (brief §25, §32, §33).
 *
 * Mission control, not a list of exercises: the plan is derived from the
 * player's own evidence (due repetitions, the top recurring pattern, phase
 * ACPL), each block states its reason and its benefit, and the session plays
 * real positions from their games.
 */

type Phase = "control" | "session";

export default function TrainingPage(): ReactNode {
  const player = usePlayer();
  const engine = useEngine();
  const [phase, setPhase] = useState<Phase>("control");
  const [queue, setQueue] = useState<TrainingItem[]>([]);
  const [focus, setFocus] = useState<MissionBlock | null>(null);
  const [busy, setBusy] = useState(false);
  const [stored, setStored] = useState<TrainingItem[]>([]);

  const loadStored = useCallback(async () => {
    try {
      setStored(await db.trainingItems.toArray());
    } catch {
      setStored([]);
    }
  }, []);

  useEffect(() => {
    void loadStored();
  }, [loadStored]);

  const mission = useMemo(
    () =>
      buildDailyMission({
        dueCount: player.due.length,
        patterns: player.patterns,
        stats: player.stats,
        repertoireGaps: 0,
      }),
    [player.due.length, player.patterns, player.stats],
  );

  const themes = useMemo(() => {
    const counts = new Map<string, { total: number; solved: number }>();
    for (const item of stored) {
      const entry = counts.get(item.theme) ?? { total: 0, solved: 0 };
      entry.total += 1;
      if (item.attempts > 0 && item.successes > 0) entry.solved += 1;
      counts.set(item.theme, entry);
    }
    return [...counts.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [stored]);

  /** Build a real queue from stored positions — never invented. */
  const buildQueue = useCallback(
    async (block: MissionBlock | null): Promise<TrainingItem[]> => {
      if (player.pool.length === 0) return [];
      await player.syncPool();
      const all = await db.trainingItems.toArray();
      setStored(all);
      const now = Date.now();
      const take = block?.count ?? 8;

      if (block?.kind === "due") {
        return all.filter((item) => item.due <= now).slice(0, Math.max(1, take));
      }

      if (block?.kind === "weakness") {
        const pattern = player.patterns.find((entry) => block.id === `pattern-${entry.id}`);
        const motif = pattern?.motif;
        if (motif) {
          const matches = all.filter((item) => item.theme.toLowerCase().includes(motif));
          if (matches.length > 0) return matches.slice(0, Math.max(1, take));
        }
      }

      const due = all.filter((item) => item.due <= now);
      const rest = all
        .filter((item) => item.due > now)
        .sort((a, b) => b.difficulty - a.difficulty);
      return [...due, ...rest].slice(0, Math.max(1, take));
    },
    [player],
  );

  const start = useCallback(
    async (block: MissionBlock | null) => {
      setBusy(true);
      try {
        const items = await buildQueue(block);
        if (items.length === 0) {
          pushToast(
            "Nothing to train yet",
            "warn",
            "Review a game first — training positions come from your own mistakes.",
          );
          return;
        }
        setQueue(items);
        setFocus(block);
        setPhase("session");
      } finally {
        setBusy(false);
      }
    },
    [buildQueue],
  );

  const grade = useCallback(
    async (item: TrainingItem, gradeValue: SrsGrade) => {
      if (item.id === undefined) return;
      const next = scheduleNext(
        {
          interval: item.interval,
          ease: item.ease,
          due: item.due,
          lastResult: item.lastResult,
          lastSeen: item.lastSeen,
          attempts: item.attempts,
          successes: item.successes,
        },
        gradeValue,
      );
      await db.trainingItems.update(item.id, next);
      setStored((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, ...next } : entry)),
      );
    },
    [],
  );

  const finish = useCallback(async () => {
    setPhase("control");
    setQueue([]);
    setFocus(null);
    await player.refresh();
    await loadStored();
    pushToast("Session complete", "success", "Spaced repetition will bring the weak ones back.");
  }, [loadStored, player]);

  if (!player.ready) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 180 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  if (player.total === 0) {
    return (
      <div className="stack">
        <header className="page-head">
          <div className="page-head-titles">
            <p className="eyebrow">Train</p>
            <h1 className="display-l">Your mistakes become your drills.</h1>
          </div>
        </header>
        <div className="empty-state">
          <div className="glyph">◎</div>
          <h3>No positions to train yet</h3>
          <p className="dim">
            Import a PGN, review a game, and every critical moment becomes a position you can play
            back — scheduled so the ones you miss return sooner.
          </p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <button className="btn primary" onClick={() => navigate("/games")}>
              Import games
            </button>
            <button className="btn ghost" onClick={() => navigate("/board")}>
              Practice on the board
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "session" && queue.length > 0) {
    return (
      <div className="stack">
        <header className="page-head">
          <div className="page-head-titles">
            <p className="eyebrow">Session · {focus?.title ?? "Mixed positions"}</p>
            <h1 className="display-m">{queue.length} positions from your own games</h1>
          </div>
          <div className="page-actions">
            <button className="btn small ghost" onClick={() => void finish()}>
              End session
            </button>
          </div>
        </header>
        <TrainingSession
          items={queue}
          evaluate={
            engine
              ? (fen: string): Promise<EngineEvaluation | null> =>
                  engine.analyze({ fen, strength: "standard", priority: 2 }).promise.catch(() => null)
              : () => Promise.resolve(null)
          }
          onGraded={(item, gradeValue) => void grade(item, gradeValue)}
          onFinished={() => void finish()}
        />
      </div>
    );
  }

  const reviewGap = player.games.length - player.analysed;

  return (
    <div className="stack">
      {/* ------------------------------------------------------------- today */}
      <header className="page-head">
        <div className="page-head-titles">
          <p className="eyebrow">Today's chess</p>
          <h1 className="display-l">{mission.headline}</h1>
          <p className="lede">{mission.reason}</p>
        </div>
        <div className="page-actions">
          <span className="chip">{mission.totalMinutes} min</span>
          <span className="chip steel">{mission.difficulty}</span>
          <button className="btn primary" onClick={() => void start(null)} disabled={busy || !engine}>
            {busy ? "Preparing…" : "Start today's chess"}
          </button>
        </div>
      </header>

      {mission.blocks.length === 0 ? (
        <div className="panel">
          <p className="prose small">
            The plan is empty because there is no evidence yet: no position is due, no pattern has
            repeated, and no phase stands out. Review a game and this page fills with a plan built
            from it.
          </p>
        </div>
      ) : (
        <div className="mission">
          {mission.blocks.map((block, index) => (
            <Reveal
              as="article"
              key={block.id}
              delay={Math.min(3, index) as 0 | 1 | 2 | 3}
              className="mission-step"
            >
              <span className="ms-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="ms-body">
                <h3 className="ms-title">{block.title}</h3>
                <p className="small faint">{block.detail}</p>
                <p className="small">{block.reason}</p>
                <p className="small faint">Benefit: {block.benefit}</p>
              </div>
              <div className="ms-side">
                <span className="chip">{block.count}</span>
                <span className="small faint">{block.minutes} min</span>
                <button
                  className="btn small"
                  onClick={() => void start(block)}
                  disabled={busy || !engine}
                >
                  Train
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------- numbers */}
      <Reveal as="section" className="reel-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Your practice</p>
            <h2 className="display-m">What is waiting for you</h2>
          </div>
          <button className="btn small ghost" onClick={() => void loadStored()}>
            Refresh
          </button>
        </div>

        <div className="grid cols-4">
          <div className="tile">
            <span className="stat-label">Due now</span>
            <span className="stat-value num">{player.due.length}</span>
            <span className="stat-sub">spaced repetition</span>
          </div>
          <div className="tile">
            <span className="stat-label">In your pool</span>
            <span className="stat-value num">{stored.length}</span>
            <span className="stat-sub">generated from {player.pool.length} reviewed positions</span>
          </div>
          <div className="tile">
            <span className="stat-label">Themes</span>
            <span className="stat-value num">{themes.length}</span>
            <span className="stat-sub">distinct mistake types</span>
          </div>
          <div className="tile">
            <span className="stat-label">Unreviewed games</span>
            <span className="stat-value num">{reviewGap}</span>
            <span className="stat-sub">each one adds new positions</span>
          </div>
        </div>

        {themes.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-eyebrow">Coverage</div>
                <div className="panel-title">Themes in your pool</div>
              </div>
            </div>
            <div className="theme-grid">
              {themes.map(([theme, stats]) => (
                <div className="theme-chip" key={theme}>
                  <span className="small">{theme}</span>
                  <span className="num small">
                    {stats.solved}/{stats.total}
                  </span>
                </div>
              ))}
            </div>
            <p className="small faint" style={{ marginTop: "var(--s-3)" }}>
              Solved counts any position you have answered at least once correctly. Failures come
              back after ten minutes, then on the SM-2 lite ladder below.
            </p>
          </div>
        )}
      </Reveal>

      {/* --------------------------------------------------------- weaknesses */}
      {player.patterns.length > 0 && (
        <Reveal as="section" className="reel-section split">
          <div>
            <div className="section-head">
              <div>
                <p className="eyebrow">Why these drills</p>
                <h2 className="display-m">Your recurring patterns</h2>
              </div>
            </div>
            <div className="panel">
              <div className="panel-rows">
                {player.patterns.slice(0, 5).map((pattern) => (
                  <div className="panel-row" key={pattern.id}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{pattern.title}</strong>
                      <div className="small faint">{pattern.evidence}</div>
                    </span>
                    <span className="chip">{pattern.training} positions</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel stack tight">
            <span className="stat-label">The schedule</span>
            <p className="small faint">
              Every position is graded pass or fail. A pass moves it out: 0 days → 1 → 3 → interval
              × ease. A fail brings it back in ten minutes and lowers its ease. Nothing is hidden —
              you can see the next review date for every position.
            </p>
            {player.due.length > 0 && (
              <div className="btn-row">
                <button className="btn small" onClick={() => void start(mission.blocks[0] ?? null)}>
                  Do the due ones first
                </button>
              </div>
            )}
          </div>
        </Reveal>
      )}
    </div>
  );
}
