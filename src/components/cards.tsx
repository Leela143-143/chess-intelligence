import type { ReactNode } from "react";

/** StatCard (spec §81) — dashboard metric tile. */
export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="card stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export type GameCardData = {
  id: number;
  white: string;
  black: string;
  result: string;
  date?: string;
  opening?: string;
  analyzed: boolean;
  /** Perspective to color the result chip: whose game was this? */
  myColor?: "w" | "b";
};

/** GameCard (spec §81) — list entry for the local game database. */
export function GameCard({
  game,
  onOpen,
}: {
  game: GameCardData;
  onOpen: (id: number) => void;
}) {
  const { result, myColor } = game;
  let outcome: "win" | "loss" | "draw" = "draw";
  if (result === "1-0") outcome = myColor === "w" ? "win" : myColor === "b" ? "loss" : "draw";
  else if (result === "0-1") outcome = myColor === "b" ? "win" : myColor === "w" ? "loss" : "draw";

  return (
    <button className="game-card" onClick={() => onOpen(game.id)}>
      <span className={`result ${outcome}`}>{result === "*" ? "…" : outcome[0]!.toUpperCase()}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600 }}>
          {game.white} — {game.black}
        </span>
        <span className="small faint">
          {game.date ?? "date unknown"}
          {game.opening ? ` · ${game.opening}` : ""}
        </span>
      </span>
      {game.analyzed && <span className="chip green">analyzed</span>}
    </button>
  );
}

/** EmptyState (spec §101) — honest empty states everywhere. */
export function EmptyState({
  glyph,
  title,
  children,
}: {
  glyph: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="glyph">{glyph}</div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
