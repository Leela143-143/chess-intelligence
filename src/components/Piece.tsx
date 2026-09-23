/**
 * Piece — original chess piece geometry (brief §11).
 *
 * Every piece is drawn here from primitives (pedestal, collar, stem, head) in
 * a 100×100 viewBox. Nothing is scraped, traced or downloaded, and nothing
 * depends on system font glyph coverage — so the same silhouette renders
 * identically on every platform and can be animated (a captured piece is a
 * real element that can leave the board).
 *
 * The six piece *sets* in the brief are six presentations of this one
 * geometry, driven purely by the tokens in styles/tokens.css:
 *   classic · tournament · editorial · minimal · sculptural · technical
 */

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";

const BASE = "M27 73 H73 C76 73 78.5 80 79.5 88 H20.5 C21.5 80 24 73 27 73 Z";

/** Head + body paths per piece (filled, stroked by the active set). */
const BODY: Record<PieceType, string[]> = {
  p: [
    "M50 20 A11.5 11.5 0 1 1 49.99 20 Z",
    "M42.5 41 H57.5 A3 3 0 0 1 57.5 47 H42.5 A3 3 0 0 1 42.5 41 Z",
    "M43 47 L40 72 H60 L57 47 Z",
    "M31 72 H69 C71.5 72 73.5 79 74.5 88 H25.5 C26.5 79 28.5 72 31 72 Z",
  ],
  n: [
    "M31 88 C31 71 33 58 42 50 C35 47 31 41 31 34 C31 25 36 19 44 15 L42 8 C41 5 44 3 46 5 L55 14 C67 19 75 31 77 47 C79 63 76 76 74 88 Z",
  ],
  b: [
    "M50 12 C58 18 63 27 63 35 C63 42 57 47 50 47 C43 47 37 42 37 35 C37 27 42 18 50 12 Z",
    "M38 47 H62 A3 3 0 0 1 62 53 H38 A3 3 0 0 1 38 47 Z",
    "M41 53 L38 73 H62 L59 53 Z",
    BASE,
  ],
  r: [
    "M30 18 H38 V24 H44 V18 H56 V24 H62 V18 H70 V38 H30 Z",
    "M36 38 H64 L62 46 H38 Z",
    "M39 46 L35 73 H65 L61 46 Z",
    "M26 73 H74 C77 73 79 80 80 88 H20 C21 80 23 73 26 73 Z",
  ],
  q: [
    "M27 40 L30 22 L40 33 L50 15 L60 33 L70 22 L73 40 Z",
    "M30 20 A3.4 3.4 0 1 1 29.99 20 Z",
    "M50 13 A3.8 3.8 0 1 1 49.99 13 Z",
    "M70 20 A3.4 3.4 0 1 1 69.99 20 Z",
    "M40 31 A2.6 2.6 0 1 1 39.99 31 Z",
    "M60 31 A2.6 2.6 0 1 1 59.99 31 Z",
    "M35 40 H65 A3 3 0 0 1 65 46 H35 A3 3 0 0 1 35 40 Z",
    "M40 46 L36 73 H64 L60 46 Z",
    "M26 73 H74 C77 73 79 80 80 88 H20 C21 80 23 73 26 73 Z",
  ],
  k: [
    "M47 4 H53 V11 H60 V17 H53 V25 H47 V17 H40 V11 H47 Z",
    "M30 46 C30 34 38 26 50 26 C62 26 70 34 70 46 Z",
    "M33 46 H67 A3 3 0 0 1 67 53 H33 A3 3 0 0 1 33 46 Z",
    "M40 53 L36 73 H64 L60 53 Z",
    "M26 73 H74 C77 73 79 80 80 88 H20 C21 80 23 73 26 73 Z",
  ],
};

/** Incised detail lines (stroked) — hidden by sets with `--pc-detail: 0`. */
const DETAIL: Record<PieceType, string[]> = {
  p: ["M41 50 H59"],
  n: ["M53 20 C61 27 66 38 67 50", "M45 31 A2.2 2.2 0 1 1 44.99 31 Z"],
  b: ["M50 19 V33", "M43 41 C46 43.5 54 43.5 57 41", "M42 58 H58"],
  r: ["M44 32 H56", "M40 62 H60"],
  q: ["M41 53 H59", "M40 64 H60"],
  k: ["M42 60 H58", "M40 66 H60"],
};

/** Volume cues — placeable highlight / occlusion shapes per piece. */
const HIGHLIGHT: Record<PieceType, string[]> = {
  p: ["M43 57 C43 52 46 49 50 49 C48 54 48 62 50 68 C46 68 43 63 43 57 Z"],
  n: ["M40 30 C46 26 56 30 62 40 C54 36 46 35 40 30 Z"],
  b: ["M45 22 C50 26 53 31 53 36 C50 33 46 28 45 22 Z"],
  r: ["M33 24 H40 V36 H33 Z", "M42 50 H49 V70 H42 Z"],
  q: ["M40 20 C45 26 47 32 46 38 C42 34 39 27 40 20 Z"],
  k: ["M38 34 C43 29 52 29 58 36 C50 33 44 33 38 34 Z"],
};

const LOW: Record<PieceType, string[]> = {
  p: ["M28 78 C34 75 34 84 34 88 H25 C25 84 25 80 28 78 Z"],
  n: [],
  b: ["M28 78 C34 75 34 84 34 88 H24 C24 84 24 80 28 78 Z"],
  r: ["M23 78 C29 75 29 84 29 88 H19 C19 84 19 80 23 78 Z"],
  q: ["M23 78 C29 75 29 84 29 88 H19 C19 84 19 80 23 78 Z"],
  k: ["M23 78 C29 75 29 84 29 88 H19 C19 84 19 80 23 78 Z"],
};

/** Construction geometry, revealed by the `technical` set (--pc-construct). */
const CONSTRUCT = [
  "M50 4 V94",
  "M18 88 H82",
  "M22 73 H78",
  "M50 88 V84",
];

export type PieceProps = {
  type: PieceType;
  color: PieceColor;
  /** Extra classes for animation states (leaving, entering, promoting…). */
  className?: string;
};

export default function Piece({ type, color, className = "" }: PieceProps) {
  const cls = `pc ${color === "b" ? "dark" : ""} ${className}`.trim();
  return (
    <svg className={cls} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g className="pc-body">
        {BODY[type].map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="pc-lo">
        {LOW[type].map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="pc-hi">
        {HIGHLIGHT[type].map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="pc-detail">
        {DETAIL[type].map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="pc-construct">
        {CONSTRUCT.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

export const PIECE_NAMES: Record<PieceType, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export const PROMOTION_CHOICES: PieceType[] = ["q", "r", "b", "n"];
