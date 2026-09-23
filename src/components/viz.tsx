import { useMemo, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import Piece, { type PieceColor, type PieceType } from "./Piece";
import type { DnaDimension } from "@/lib/chess/dna";
import type { RatingPoint } from "@/lib/player/stats";
import { qualityBand, type MoveAssessment } from "@/lib/chess/review";

/**
 * Data-visualisation primitives (brief §44).
 *
 * Small, dependency-free SVG instruments with keyboard and screen-reader
 * fallbacks. Nothing here reaches for a charting library; each primitive owns
 * a fixed logical viewBox and scales with its container.
 */

/* ------------------------------------------------------------------ spark */

export function Sparkline({
  values,
  height = 34,
  label,
  showArea = true,
}: {
  values: number[];
  height?: number;
  label?: string;
  showArea?: boolean;
}): ReactNode {
  const W = 120;
  const H = 34;
  const path = useMemo(() => {
    if (values.length === 0) return { line: "", area: "" };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values.map((value, index) => {
      const x = values.length === 1 ? W / 2 : (index / (values.length - 1)) * W;
      const y = H - 2 - ((value - min) / span) * (H - 6);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const line = `M${points.join(" L")}`;
    return { line, area: `${line} L${W},${H} L0,${H} Z` };
  }, [values]);

  if (values.length === 0) {
    return <span className="faint tiny">no data</span>;
  }

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label={label ?? `Trend of ${values.length} values`}
    >
      {showArea && <path className="a" d={path.area} />}
      <path className="l" d={path.line} />
      <circle
        className="p"
        cx={W}
        cy={
          H -
          2 -
          ((values[values.length - 1]! - Math.min(...values)) /
            (Math.max(...values) - Math.min(...values) || 1)) *
            (H - 6)
        }
        r={1.8}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------- ring */

export function Ring({
  value,
  max = 100,
  caption,
}: {
  value: number;
  max?: number;
  caption: string;
}): ReactNode {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = 20;
  const circumference = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 50 50" role="img" aria-label={`${caption}: ${value}`}>
      <circle className="bg" cx="25" cy="25" r={r} />
      <circle
        className="fg"
        cx="25"
        cy="25"
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        transform="rotate(-90 25 25)"
      />
      <text x="25" y="29" textAnchor="middle">
        {Math.round(value)}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------- radar */

export function Radar({
  dimensions,
  selected,
  onSelect,
  previous,
}: {
  dimensions: DnaDimension[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** Optional earlier profile drawn as a dashed outline. */
  previous?: number[];
}): ReactNode {
  const size = 300;
  const center = size / 2;
  const radius = size / 2 - 46;
  const count = dimensions.length;

  const pointAt = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r] as const;
  };

  const shape = dimensions
    .map((dim, index) => pointAt(index, dim.score).map((v) => v.toFixed(1)).join(","))
    .join(" ");

  const rings = [25, 50, 75, 100];

  return (
    <svg
      className="radar"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Chess DNA across ten dimensions"
    >
      {rings.map((ring) => (
        <polygon
          key={ring}
          className="grid"
          points={dimensions
            .map((_, index) => pointAt(index, ring).map((v) => v.toFixed(1)).join(","))
            .join(" ")}
        />
      ))}
      {dimensions.map((dim, index) => {
        const [x, y] = pointAt(index, 100);
        return <line key={dim.id} className="spoke" x1={center} y1={center} x2={x} y2={y} />;
      })}

      {previous && previous.length === count && (
        <polygon
          className="prev"
          points={previous
            .map((value, index) => pointAt(index, value).map((v) => v.toFixed(1)).join(","))
            .join(" ")}
        />
      )}

      <polygon className="shape" points={shape} />

      {dimensions.map((dim, index) => {
        const [x, y] = pointAt(index, dim.score);
        const [lx, ly] = pointAt(index, 122);
        const anchor = Math.abs(lx - center) < 14 ? "middle" : lx > center ? "start" : "end";
        return (
          <g key={dim.id}>
            <circle
              className={`dot ${selected === dim.id ? "sel" : ""}`}
              cx={x}
              cy={y}
              r={selected === dim.id ? 5 : 3}
            />
            <text
              className={`dim-label ${selected === dim.id ? "sel" : ""}`}
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="middle"
              onClick={() => onSelect?.(dim.id)}
            >
              {dim.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* --------------------------------------------------------- rating timeline */

type Range = 30 | 90 | "year" | "all";

export function RatingTimeline({
  points,
  onOpenGame,
}: {
  points: RatingPoint[];
  onOpenGame?: (gameId: number) => void;
}): ReactNode {
  const [range, setRange] = useState<Range>("all");
  const [hover, setHover] = useState<number | null>(null);

  const visible = useMemo(() => {
    if (range === "all") return points;
    if (range === "year") return points.slice(-Math.min(points.length, 200));
    return points.slice(-Math.min(points.length, range));
  }, [points, range]);

  if (points.length < 2) {
    return (
      <p className="faint small">
        Rating history needs at least two games with an Elo in the PGN headers.
      </p>
    );
  }

  const W = 320;
  const H = 90;
  const values = visible.map((point) => point.elo);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xAt = (index: number) =>
    visible.length === 1 ? W / 2 : (index / (visible.length - 1)) * W;
  const yAt = (value: number) => H - 8 - ((value - min) / span) * (H - 20);

  const line = visible.map((point, index) => `${xAt(index).toFixed(2)},${yAt(point.elo).toFixed(2)}`).join(" ");
  const active = hover !== null ? visible[hover] : null;

  return (
    <div className="viz-card">
      <div className="row between wrap">
        <div className="evalgraph-legend">
          <span>{min} – {max}</span>
          <span>{visible.length} games</span>
        </div>
        <div className="seg">
          {([30, 90, "year", "all"] as Range[]).map((option) => (
            <button
              key={String(option)}
              aria-pressed={range === option}
              onClick={() => setRange(option)}
            >
              {option === "year" ? "1 year" : option === "all" ? "All" : `${option}g`}
            </button>
          ))}
        </div>
      </div>

      <svg
        className="timeline"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: 120 }}
        role="img"
        aria-label={`Rating from ${min} to ${max} across ${visible.length} games`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          setHover(Math.max(0, Math.min(visible.length - 1, Math.round(ratio * (visible.length - 1)))));
        }}
      >
        <line className="grid" x1="0" y1={H - 8} x2={W} y2={H - 8} />
        <polyline className="line" points={line} vectorEffect="non-scaling-stroke" />
        {visible.map((point, index) => (
          <g
            key={point.gameId}
            className="pt"
            onPointerEnter={() => setHover(index)}
            onClick={() => onOpenGame?.(point.gameId)}
          >
            <circle
              cx={xAt(index)}
              cy={yAt(point.elo)}
              r={active === point ? 4 : 2}
            />
          </g>
        ))}
        {active && (
          <line
            className="cursor-line"
            x1={xAt(hover!)}
            y1="0"
            x2={xAt(hover!)}
            y2={H}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {active ? (
        <div className="row wrap small">
          <span className="num">{active.elo}</span>
          <span className="dim">{active.date ?? "date unknown"}</span>
          <span className={active.outcome === "win" ? "stat-delta up" : active.outcome === "loss" ? "stat-delta down" : "dim"}>
            {active.outcome}
          </span>
          {active.opening && <span className="faint">{active.opening}</span>}
          {active.accuracy !== undefined && <span className="dim">acc {active.accuracy}%</span>}
          <button className="btn small ghost" onClick={() => onOpenGame?.(active.gameId)}>
            open
          </button>
        </div>
      ) : (
        <p className="faint tiny">Hover or drag across the line to inspect a game.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- heat strip */

export function HeatStrip({
  moves,
  color,
  onSelect,
  criticalPlies,
}: {
  moves: MoveAssessment[];
  color: "w" | "b";
  onSelect?: (ply: number) => void;
  criticalPlies?: number[];
}): ReactNode {
  const own = moves.filter((move) => move.mover === color);
  const critical = new Set(criticalPlies ?? []);
  return (
    <div className="heat" aria-hidden="true">
      {own.map((move) => {
        const band = qualityBand(move.classification);
        const value =
          band === "best" ? 2 : band === "good" ? 1 : band === "blunder" || band === "mistake" ? -2 : band === "inaccuracy" ? -1 : 0;
        return (
          <i
            key={move.ply}
            data-v={String(value)}
            title={`${Math.ceil(move.ply / 2)}${move.mover === "w" ? "." : "…"} ${move.san} — ${move.classification}`}
            onClick={() => onSelect?.(move.ply)}
            style={critical.has(move.ply) ? { outline: "1px solid var(--warn)" } : undefined}
          />
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- mini board */

export function MiniBoard({
  fen,
  label,
  size = 96,
}: {
  fen: string;
  label: string;
  size?: number;
}): ReactNode {
  const squares = useMemo(() => {
    const out: Array<{ square: string; piece: { type: PieceType; color: PieceColor } | null; light: boolean }> = [];
    try {
      const board = new Chess(fen).board();
      board.forEach((row, rowIndex) => {
        row.forEach((entry, colIndex) => {
          const file = "abcdefgh"[colIndex]!;
          const rank = 8 - rowIndex;
          out.push({
            square: `${file}${rank}`,
            piece: entry ? { type: entry.type as PieceType, color: entry.color as PieceColor } : null,
            light: (colIndex + rowIndex) % 2 === 0,
          });
        });
      });
    } catch {
      /* leave empty */
    }
    return out;
  }, [fen]);

  return (
    <div
      className="miniboard"
      style={{ gridTemplateColumns: "repeat(8, 1fr)", width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {squares.map((square) => (
        <span key={square.square} className={square.light ? "light" : "dark"}>
          {square.piece && <Piece type={square.piece.type} color={square.piece.color} />}
        </span>
      ))}
    </div>
  );
}
