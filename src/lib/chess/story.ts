import { materialBalance } from "./phase";
import { plyToMoveNumber } from "./replay";
import type { GameStory, KeyMoment, MoveAssessment, ReviewedGame, StoryBeat } from "./review";

/**
 * Deterministic game story (brief §22, §63).
 *
 * Every sentence here is derived from chess facts the engine reported:
 * classifications, centipawn swings, detected motifs and material balance.
 * No language model is involved — Gemma can later *rewrite* the wording, but
 * it will never be the source of these claims.
 */

const MOTIF_PLAIN: Record<string, string> = {
  fork: "a fork",
  "double-attack": "a double attack",
  pin: "a pin",
  skewer: "a skewer",
  "hanging-piece": "a loose piece",
  "mate-in-one": "a mate threat",
  "back-rank-mate": "a back-rank mate",
  "discovered-check": "a discovered check",
  "double-check": "a double check",
};

function pawns(cp: number): number {
  return cp / 100;
}

function sideName(color: "w" | "b"): string {
  return color === "w" ? "White" : "Black";
}

function other(color: "w" | "b"): "w" | "b" {
  return color === "w" ? "b" : "w";
}

/** Centipawns from `color`'s point of view. */
function fromPerspective(cp: number, color: "w" | "b"): number {
  return color === "w" ? cp : -cp;
}

function resultFor(result: string, color: "w" | "b"): "win" | "loss" | "draw" | "unknown" {
  if (result === "1-0") return color === "w" ? "win" : "loss";
  if (result === "0-1") return color === "b" ? "win" : "loss";
  if (result === "1/2-1/2") return "draw";
  return "unknown";
}

function biggestAgainst(moments: KeyMoment[], color: "w" | "b"): KeyMoment | null {
  const against = moments.filter((moment) => moment.mover === color);
  if (against.length === 0) return null;
  return against.reduce((worst, moment) =>
    moment.cpLoss > worst.cpLoss ? moment : worst,
  );
}

function biggestFor(moments: KeyMoment[], color: "w" | "b"): KeyMoment | null {
  const own = moments.filter((moment) => moment.mover !== color);
  if (own.length === 0) return null;
  return own.reduce((best, moment) => (moment.cpLoss > best.cpLoss ? moment : best));
}

function openingOutlook(review: ReviewedGame, color: "w" | "b"): number {
  const moves = review.moves;
  if (moves.length === 0) return 0;
  let lastBook = 0;
  for (const move of moves) {
    if (move.classification === "book") lastBook = move.ply;
  }
  const index = Math.min(moves.length - 1, Math.max(lastBook, 9));
  const move = moves[index]!;
  return fromPerspective(move.evalAfterCp, color);
}

function countErrors(moves: MoveAssessment[], color: "w" | "b", afterPly: number): number {
  return moves.filter(
    (move) =>
      move.mover === color &&
      move.ply > afterPly &&
      (move.classification === "blunder" ||
        move.classification === "mistake" ||
        move.classification === "missed-opportunity"),
  ).length;
}

export function buildGameStory(
  review: ReviewedGame,
  options: { perspective?: "w" | "b" | null; result?: string } = {},
): GameStory {
  const color = options.perspective ?? null;
  const result = options.result ?? "*";
  const beats: StoryBeat[] = [];

  if (review.plies === 0) {
    return {
      beats: [
        {
          label: "Nothing to review",
          text: "This game has no moves the engine could assess.",
          tone: "neutral",
        },
      ],
      verdict: "No moves to review.",
      perspective: color,
    };
  }

  /* ------------------------------------------------------------- opening */
  const openingLabel = review.opening
    ? `${review.opening.eco} · ${review.opening.name}${
        review.opening.variation ? ` — ${review.opening.variation}` : ""
      }`
    : "an unpublished line";

  if (color) {
    const outlookCp = openingOutlook(review, color);
    const outlook = pawns(outlookCp);
    const openingBeats =
      outlook > 0.9
        ? `You came out of ${openingLabel} with a comfortable position (${outlook > 0 ? "+" : ""}${outlook.toFixed(2)}).`
        : outlook < -0.9
          ? `You were already under pressure out of ${openingLabel} (${outlook.toFixed(2)}).`
          : `You reached a roughly balanced position out of ${openingLabel}.`;
    beats.push({ label: "Opening", text: openingBeats, tone: "neutral" });
  } else {
    beats.push({
      label: "Opening",
      text: `The game followed ${openingLabel}.`,
      tone: "neutral",
    });
  }

  /* -------------------------------------------------------- turning point */
  const against = color ? biggestAgainst(review.moments, color) : null;
  const forSide = color ? biggestFor(review.moments, color) : null;
  const pivot =
    against ??
    (review.moments.length > 0
      ? review.moments.reduce((worst, moment) => (moment.cpLoss > worst.cpLoss ? moment : worst))
      : null);

  if (pivot) {
    const motif = pivot.allowedMotifs?.[0] ?? pivot.motifs[0];
    const clause = motif ? ` The concession involved ${MOTIF_PLAIN[motif] ?? motif}.` : "";
    beats.push({
      label: "Turning point",
      text: `${plyToMoveNumber(pivot.ply)}${
        pivot.mover === "w" ? "." : "…"
      }${pivot.san} — ${pivot.explanation}${clause}`,
      tone: "neg",
      ply: pivot.ply,
    });
  }

  /* ------------------------------------------------------------ pressure */
  if (pivot && color) {
    const errors = countErrors(review.moves, color, pivot.ply);
    const swing = pawns(fromPerspective(pivot.evalAfterCp - pivot.evalBeforeCp, color));
    const tone: StoryBeat["tone"] = errors >= 3 ? "neg" : "warn";
    beats.push({
      label: "Pressure",
      text:
        errors === 0
          ? `You stabilised and made no further errors after that (${swing.toFixed(2)} net swing).`
          : `${errors} further error${errors === 1 ? "" : "s"} followed as the position drifted (${swing.toFixed(2)} net swing).`,
      tone,
      ply: pivot.ply,
    });
  }

  /* ------------------------------------------------------------- endgame */
  const endgameStart = review.moves.find((move) => move.phase === "endgame");
  if (endgameStart) {
    let material = 0;
    try {
      material = materialBalance(endgameStart.fenBefore);
    } catch {
      material = 0;
    }
    const materialText =
      Math.abs(material) < 0.5
        ? "material was level"
        : `material was ${material > 0 ? "+" : "−"}${Math.abs(material)} for White`;
    beats.push({
      label: "Endgame",
      text: `The game reached an endgame at move ${plyToMoveNumber(endgameStart.ply)} where ${materialText}.`,
      tone: "neutral",
      ply: endgameStart.ply,
    });
  }

  /* ---------------------------------------------------------- conclusion */
  const ownSummary = color === "b" ? review.black : review.white;
  const outcome = color ? resultFor(result, color) : "unknown";
  const motifTally = ownSummary.motifs.length > 0 ? ownSummary.motifs[0] : null;
  const allowedTally = new Map<string, number>();
  for (const move of review.moves) {
    if (color && move.mover !== color) continue;
    for (const motif of move.allowedMotifs) {
      allowedTally.set(motif, (allowedTally.get(motif) ?? 0) + 1);
    }
  }
  const worstAllowed = [...allowedTally.entries()].sort((a, b) => b[1] - a[1])[0];

  let cause: string;
  if (!color) {
    cause = `The decisive swing came at move ${pivot ? plyToMoveNumber(pivot.ply) : "—"}.`;
  } else if (outcome === "win") {
    cause =
      forSide && against && forSide.cpLoss > against.cpLoss
        ? `Your opponent's error at move ${plyToMoveNumber(forSide.ply)} was the decisive moment.`
        : `You converted a ${ownSummary.accuracy.toFixed(1)}% accuracy performance.`;
  } else if (outcome === "draw") {
    cause = `A balanced game — ${ownSummary.accuracy.toFixed(1)}% accuracy on your side and no single decisive error.`;
  } else if (worstAllowed) {
    cause = `The main cause was repeated ${MOTIF_PLAIN[worstAllowed[0]] ?? worstAllowed[0]} (${worstAllowed[1]}×) — the engine shows a better move each time.`;
  } else if (ownSummary.counts.blunder > 0) {
    cause = `The main cause was ${ownSummary.counts.blunder} blunder${ownSummary.counts.blunder === 1 ? "" : "s"} in an otherwise playable game.`;
  } else if (motifTally) {
    cause = `Nothing collapsed tactically; you simply never generated the initiative you needed.`;
  } else {
    cause = `The position slipped gradually rather than in one move.`;
  }

  beats.push({
    label: "Conclusion",
    text: cause,
    tone: outcome === "loss" ? "neg" : "neutral",
  });

  return {
    beats,
    verdict: cause,
    perspective: color,
  };
}

/**
 * Short label for a moment's role, used in UI lists.
 * Deterministic — derived from the moment's kind and size.
 */
export function momentRole(moment: KeyMoment): string {
  switch (moment.kind) {
    case "brilliant":
      return "Brilliant sacrifice";
    case "exceptional":
      return "Exceptional find";
    case "allowed-mate":
      return "Mate allowed";
    case "missed-mate":
      return "Mate missed";
    case "material-loss":
      return "Material lost";
    case "defensive-failure":
      return "Defence failed";
    default:
      return `−${pawns(moment.cpLoss).toFixed(1)} pawn swing`;
  }
}

/** Which side the moment favoured, for colour coding. */
export function momentFavours(moment: KeyMoment): "w" | "b" {
  return other(moment.mover);
}

export { sideName };
