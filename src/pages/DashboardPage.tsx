import { useEffect, useState } from "react";
import { navigate } from "@/lib/router";
import { listGames, getProfile, db, type GameRecord } from "@/lib/db/schema";
import { detectOpening } from "@/lib/chess/openings";
import { EmptyState, StatCard, GameCard, type GameCardData } from "@/components/cards";
import { useEngine } from "@/lib/engineContext";

/**
 * Dashboard (spec §49) — answers:
 * How am I playing? What improved? What am I doing wrong?
 * What should I practice? What should I review today?
 */

function gameToCard(game: GameRecord): GameCardData {
  const opening = detectOpening(game.sanList);
  return {
    id: game.id!,
    white: game.headers.white ?? "White",
    black: game.headers.black ?? "Black",
    result: game.result,
    date: game.headers.date,
    opening: opening ? `${opening.eco} ${opening.name}${opening.variation ? ` (${opening.variation})` : ""}` : undefined,
    analyzed: Boolean(game.analyzedAt),
  };
}

export default function DashboardPage() {
  const engine = useEngine();
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [analysesCount, setAnalysesCount] = useState(0);
  const [profileName, setProfileName] = useState("Player");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listGames(), db.analyses.count(), getProfile()])
      .then(([gameList, count, profile]) => {
        if (cancelled) return;
        setGames(gameList);
        setAnalysesCount(count);
        setProfileName(profile.displayName);
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (games === null) {
    return <div className="skeleton" style={{ height: 220 }} aria-label="Loading" />;
  }

  const recent = games.slice(0, 10);
  const wins = recent.filter((g) => g.result === "1-0").length;
  const losses = recent.filter((g) => g.result === "0-1").length;
  const draws = recent.filter((g) => g.result === "1/2-1/2").length;
  const analyzed = games.filter((g) => g.analyzedAt).length;

  const rating =
    games
      .map((g) => Number(g.headers.whiteElo ?? g.headers.blackElo ?? 0))
      .filter((n) => n > 1000)
      .slice(0, 20)
      .reduce((sum, n, _, arr) => sum + n / arr.length, 0) || null;

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <h1>Welcome back, {profileName}</h1>
          <div className="dim small">
            Understand your chess. Improve deliberately. — everything stays on this device.
          </div>
        </div>
        <span className="chip">
          {engine ? `⚙ ${engine.statusMessage}` : "⚙ engine starting…"}
        </span>
      </div>

      {games.length === 0 ? (
        <EmptyState glyph="◇" title="Your chess intelligence starts with your games">
          <p>Import a PGN to unlock analysis, patterns, Chess DNA and training.</p>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn primary" onClick={() => navigate("/games")}>
              Import PGN
            </button>
            <button className="btn" onClick={() => navigate("/board")}>
              Open analysis board
            </button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="grid cols-3">
            <StatCard
              label="Recent form"
              value={`${wins}W · ${draws}D · ${losses}L`}
              sub={`last ${recent.length} games`}
            />
            <StatCard
              label="Games"
              value={games.length}
              sub={`${analyzed} analyzed`}
            />
            <StatCard
              label="Rating (from imports)"
              value={rating ? Math.round(rating) : "—"}
              sub="avg of recent imported Elos"
            />
          </div>

          <div className="card">
            <h2>
              How am I doing?
              <button className="btn small ghost" onClick={() => navigate("/games")}>
                Import more
              </button>
            </h2>
            <p className="dim small">
              {analysesCount > 0
                ? `${analysesCount} game${analysesCount > 1 ? "s" : ""} analyzed. Open a game to review accuracy, critical moments and coach notes.`
                : "No full-game analyses yet — open a game and run analysis to unlock accuracy, blunder counts and critical moments."}
            </p>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => navigate("/board")}>
                Analyze a position
              </button>
              <button className="btn small" onClick={() => navigate("/training")}>
                What should I practice?
              </button>
            </div>
          </div>

          <div>
            <h2>Recent games</h2>
            <div className="stack">
              {recent.map((game) => (
                <GameCard
                  key={game.id}
                  game={gameToCard(game)}
                  onOpen={(id) => navigate(`/game/${id}`)}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Coach recommendations</h2>
            <p className="dim small">
              {analysesCount >= 5
                ? "Enough analyzed games to surface recurring patterns — coming with the Player Intelligence engine (Phase 6)."
                : "Analyze at least 5 games to unlock evidence-based recommendations (recurring mistakes, opening gaps, endgame conversion)."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
