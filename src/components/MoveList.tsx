import type { MoveClassification } from "@/lib/chess/classification";

/**
 * MoveList (spec §81) — two-column move table with classification glyphs.
 * Glyphs: ★ best  ✓ good  ⧗ book  ?! inaccuracy  ? mistake  † blunder  ∞ missed  → forced
 */

const CLASS_GLYPH: Record<string, { glyph: string; cls: string }> = {
  best: { glyph: "★", cls: "cls-good" },
  excellent: { glyph: "✓", cls: "cls-good" },
  good: { glyph: "·", cls: "cls-good" },
  book: { glyph: "⌘", cls: "cls-good" },
  forced: { glyph: "→", cls: "cls-good" },
  "only-move": { glyph: "→", cls: "cls-good" },
  inaccuracy: { glyph: "?! ", cls: "cls-warn" },
  mistake: { glyph: "?", cls: "cls-warn" },
  blunder: { glyph: "†", cls: "cls-bad" },
  "missed-opportunity": { glyph: "∞", cls: "cls-bad" },
};

export type MoveListProps = {
  sans: string[];
  currentPly: number; // 0 = start position, 1 = after first move
  onSelect: (ply: number) => void;
  classifications?: MoveClassification[];
};

export default function MoveList({ sans, currentPly, onSelect, classifications }: MoveListProps) {
  if (sans.length === 0) {
    return <div className="faint small">No moves yet.</div>;
  }

  const rows: Array<{ no: number; white?: { ply: number; san: string }; black?: { ply: number; san: string } }> = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push({
      no: i / 2 + 1,
      white: { ply: i + 1, san: sans[i]! },
      black: sans[i + 1] ? { ply: i + 2, san: sans[i + 1]! } : undefined,
    });
  }

  const cell = (entry?: { ply: number; san: string }) => {
    if (!entry) return <td />;
    const cls = classifications?.[entry.ply - 1];
    const glyph = cls ? CLASS_GLYPH[cls] : undefined;
    return (
      <td>
        <button
          className={`mv ${currentPly === entry.ply ? "active" : ""}`}
          onClick={() => onSelect(entry.ply)}
        >
          {entry.san}
          {glyph && (
            <span className={`cls ${glyph.cls}`} title={cls}>
              {glyph.glyph}
            </span>
          )}
        </button>
      </td>
    );
  };

  return (
    <div className="movelist" role="list" aria-label="Moves">
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.no}>
              <td className="plyno">{row.no}.</td>
              {cell(row.white)}
              {cell(row.black)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
