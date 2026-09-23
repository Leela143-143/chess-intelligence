import { useMemo, useState, type ReactNode } from "react";
import { formatEval } from "@/lib/chess/analysis";
import type { EvalPoint, KeyMoment, MoveAssessment } from "@/lib/chess/review";

/**
 * EvaluationGraph (brief §17) — an instrument, not a chart.
 *
 * Axes, a zero line, advantage zones, one marker per ply, distinct markers for
 * key moments, a hover crosshair with a full readout, click-to-navigate and
 * keyboard scrubbing. The SVG is a fixed logical viewBox that scales with its
 * container, and the data is mirrored into an accessible summary.
 */

const W = 320;
const H = 96;
const CAP = 600;

export type EvaluationGraphProps = {
  points: EvalPoint[];
  moves?: MoveAssessment[];
  moments?: KeyMoment[];
  selectedPly?: number;
  onSelect?: (ply: number) => void;
  height?: number;
  /** Draw White's advantage as a light band above the zero line. */
  showZones?: boolean;
};

export default function EvaluationGraph({
  points,
  moves = [],
  moments = [],
  selectedPly,
  onSelect,
  height = 132,
  showZones = true,
}: EvaluationGraphProps): ReactNode {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const xs = (index: number) =>
      points.length === 1 ? W / 2 : (index / (points.length - 1)) * W;
    const ys = (cp: number) => {
      const clamped = Math.max(-CAP, Math.min(CAP, cp));
      return H / 2 - (clamped / CAP) * (H / 2 - 3);
    };
    const line = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${xs(index).toFixed(2)},${ys(point.cp).toFixed(2)}`)
      .join(" ");
    const area = `${line} L${xs(points.length - 1).toFixed(2)},${H / 2} L${xs(0).toFixed(2)},${H / 2} Z`;
    return { xs, ys, line, area };
  }, [points]);

  if (!geom) {
    return (
      <p className="faint small" style={{ padding: "14px 0" }}>
        No evaluations yet — run a review to see the evaluation curve.
      </p>
    );
  }

  const { xs, ys, line, area } = geom;
  const selectedIndex = selectedPly !== undefined ? points.findIndex((p) => p.ply === selectedPly) : -1;
  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverMove = hoverPoint && hoverPoint.ply > 0 ? moves[hoverPoint.ply - 1] : undefined;
  const momentPlies = new Set(moments.map((moment) => moment.ply));

  const readout = hoverPoint ?? (selectedIndex >= 0 ? points[selectedIndex] : null);

  const worstCp = Math.min(...points.map((point) => point.cp));
  const bestCp = Math.max(...points.map((point) => point.cp));

  return (
    <div className="evalgraph-wrap">
      <div className="evalgraph-readout">
        {readout ? (
          <>
            <span className="v">{formatEval(readout.cp, readout.mate)}</span>
            <span>{readout.ply === 0 ? "start" : `${Math.ceil(readout.ply / 2)}${readout.ply % 2 ? "." : "…"}`}</span>
          </>
        ) : (
          <span>white advantage ↑</span>
        )}
      </div>

      <svg
        className="evalgraph"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height }}
        role="img"
        aria-label={`Evaluation graph. White's best moment was ${formatEval(bestCp, null)}, worst ${formatEval(worstCp, null)}.`}
        tabIndex={0}
        onPointerLeave={() => setHoverIndex(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
          setHoverIndex(
            Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))),
          );
        }}
        onClick={() => {
          if (hoverIndex === null) return;
          const point = points[hoverIndex];
          if (point) onSelect?.(point.ply);
        }}
        onKeyDown={(event) => {
          const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (step === 0) return;
          event.preventDefault();
          const base = selectedPly ?? 0;
          const next = Math.max(0, Math.min(points.length - 1, base + step));
          onSelect?.(next);
        }}
      >
        {showZones && (
          <>
            <rect className="zone-adv" x="0" y="0" width={W} height={H / 2} />
            <rect x="0" y={H / 2} width={W} height={H / 2} fill="var(--bg)" opacity="0.18" />
          </>
        )}

        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            className="gridline"
            x1={fraction * W}
            y1="0"
            x2={fraction * W}
            y2={H}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path className="area" d={area} />
        <line className="zero" x1="0" y1={H / 2} x2={W} y2={H / 2} vectorEffect="non-scaling-stroke" />
        <path className="line" d={line} vectorEffect="non-scaling-stroke" />

        {/* one marker per ply — this is what makes it a timeline, not a line */}
        {points.map((point, index) =>
          point.ply === 0 ? null : (
            <rect
              key={point.ply}
              className={momentPlies.has(point.ply) ? "marker crit" : "marker"}
              x={xs(index) - 0.8}
              y={ys(point.cp) - 1.6}
              width={1.6}
              height={3.2}
              rx={0.8}
              vectorEffect="non-scaling-stroke"
              opacity={momentPlies.has(point.ply) ? 1 : 0.7}
            />
          ),
        )}

        {selectedIndex >= 0 && (
          <line
            className="cursor"
            x1={xs(selectedIndex)}
            y1="0"
            x2={xs(selectedIndex)}
            y2={H}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {hoverIndex !== null && (
          <g>
            <line
              className="cursor"
              x1={xs(hoverIndex)}
              y1="0"
              x2={xs(hoverIndex)}
              y2={H}
              vectorEffect="non-scaling-stroke"
              opacity="0.6"
            />
            <circle
              cx={xs(hoverIndex)}
              cy={ys((hoverPoint ?? points[0]!).cp)}
              r={2.6}
              fill="var(--accent)"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        <text className="axis-label" x="2" y="9" style={{ fontSize: 4 }}>
          +{CAP / 100}
        </text>
        <text className="axis-label" x="2" y={H - 3} style={{ fontSize: 4 }}>
          −{CAP / 100}
        </text>
      </svg>

      <div className="row between wrap" style={{ marginTop: 6 }}>
        <div className="evalgraph-legend">
          <span>
            <span style={{ color: "var(--warn)" }}>■</span> critical moment
          </span>
          <span>
            <span style={{ color: "var(--steel)" }}>■</span> ply
          </span>
        </div>
        {hoverMove && (
          <span className="small dim">
            {hoverMove.ply % 2 === 1
              ? `${Math.ceil(hoverMove.ply / 2)}. `
              : `${Math.ceil(hoverMove.ply / 2)}… `}
            {hoverMove.san} · {hoverMove.classification}
          </span>
        )}
      </div>

      <p className="sr-only">
        Evaluation spans {formatEval(worstCp, null)} to {formatEval(bestCp, null)} across{" "}
        {points.length - 1} plies. {moments.length} critical moments were identified at plies{" "}
        {moments.map((moment) => moment.ply).join(", ") || "none"}.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- eval bar */

export function EvalBar({
  cp,
  mate = null,
  height = 120,
  stretch = false,
}: {
  cp: number;
  mate?: number | null;
  height?: number;
  /** Fill the height of the flex row instead of a fixed height. */
  stretch?: boolean;
}): ReactNode {
  const pct = (() => {
    if (mate !== null && mate !== 0) return mate > 0 ? 96 : 4;
    const clamped = Math.max(-800, Math.min(800, cp));
    return Math.max(4, Math.min(96, 50 + clamped / 16));
  })();

  return (
    <div
      className={`evalbar ${mate !== null && mate !== 0 ? "mate" : ""}`}
      style={stretch ? { height: "auto", alignSelf: "stretch" } : { height }}
      role="img"
      aria-label={`Evaluation ${formatEval(cp, mate)}, ${
        (mate !== null && mate !== 0 ? mate > 0 : cp > 0) ? "White" : "Black"
      } is winning`}
    >
      <span className="fill" style={{ height: `${pct}%` }} />
      <span className="mark" />
    </div>
  );
}

