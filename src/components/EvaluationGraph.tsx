/**
 * EvaluationGraph (spec §39, §49) — SVG eval curve.
 * Points are White-perspective centipawns; mates plot at ±1000.
 */

export type EvalPoint = {
  ply: number;
  cp: number;
  mate?: number | null;
};

export type EvaluationGraphProps = {
  points: EvalPoint[];
  selectedPly?: number;
  onSelect?: (ply: number) => void;
  /** Plies flagged as critical moments (drawn red). */
  criticalPlies?: number[];
  height?: number;
};

const VIEW_W = 200;
const VIEW_H = 40;
const CAP = 800;

export default function EvaluationGraph({
  points,
  selectedPly,
  onSelect,
  criticalPlies = [],
  height = 96,
}: EvaluationGraphProps) {
  if (points.length === 0) {
    return (
      <div className="faint small" style={{ padding: "14px 0" }}>
        No evaluations yet — run an analysis to see the eval curve.
      </div>
    );
  }

  const xs = (index: number) =>
    points.length === 1 ? VIEW_W / 2 : (index / (points.length - 1)) * VIEW_W;
  // Invert: +cp (White better) → smaller y (top).
  const ys = (cp: number) => {
    const clamped = Math.max(-CAP, Math.min(CAP, cp));
    return VIEW_H / 2 - (clamped / CAP) * (VIEW_H / 2 - 2);
  };

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xs(index).toFixed(2)},${ys(point.cp).toFixed(2)}`)
    .join(" ");
  const area = `${line} L${xs(points.length - 1).toFixed(2)},${VIEW_H / 2} L${xs(0).toFixed(2)},${VIEW_H / 2} Z`;

  const criticalSet = new Set(criticalPlies);

  return (
    <svg
      className="evalgraph"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label="Evaluation graph"
      onClick={(event) => {
        if (!onSelect) return;
        const rect = (event.target as SVGElement).ownerSVGElement?.getBoundingClientRect() ??
          (event.currentTarget as SVGSVGElement).getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        const index = Math.round(ratio * (points.length - 1));
        const point = points[Math.max(0, Math.min(points.length - 1, index))];
        if (point) onSelect(point.ply);
      }}
    >
      <line className="axis" x1="0" y1={VIEW_H / 2} x2={VIEW_W} y2={VIEW_H / 2} />
      <path d={area} fill="rgba(127,168,255,0.12)" />
      <path d={line} fill="none" stroke="var(--accent-2)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {points.map((point, index) =>
        criticalSet.has(point.ply) ? (
          <circle
            key={point.ply}
            cx={xs(index)}
            cy={ys(point.cp)}
            r="2.4"
            fill="var(--danger)"
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
      {selectedPly !== undefined && (
        <line
          x1={(() => {
            const index = points.findIndex((p) => p.ply === selectedPly);
            return xs(Math.max(0, index));
          })()}
          y1="0"
          x2={(() => {
            const index = points.findIndex((p) => p.ply === selectedPly);
            return xs(Math.max(0, index));
          })()}
          y2={VIEW_H}
          stroke="var(--accent)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          opacity="0.8"
        />
      )}
    </svg>
  );
}
