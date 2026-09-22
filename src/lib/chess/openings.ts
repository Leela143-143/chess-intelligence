/**
 * Opening intelligence (spec §33).
 *
 * A small original ECO index of main lines (move sequences and names are
 * chess facts). Expansion with a licensed dataset is planned — every future
 * dataset must be recorded in docs/licenses.md with source/license/version.
 */

export type OpeningEntry = {
  eco: string;
  name: string;
  variation?: string;
  /** SAN main line. */
  moves: string[];
};

export const OPENING_INDEX: OpeningEntry[] = [
  { eco: "B20", name: "Sicilian Defense", moves: ["e4", "c5"] },
  { eco: "B30", name: "Sicilian Defense", variation: "Alapin", moves: ["e4", "c5", "c3"] },
  { eco: "B33", name: "Sicilian Defense", variation: "Najdorf", moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nf3", "a6"] },
  { eco: "B22", name: "Sicilian Defense", variation: "Alapin", moves: ["e4", "c5", "c3", "Nf6", "e5"] },
  { eco: "B21", name: "Sicilian Defense", variation: "Smith-Morra", moves: ["e4", "c5", "d4", "cxd4", "c3"] },
  { eco: "C00", name: "French Defense", moves: ["e4", "e6"] },
  { eco: "C02", name: "French Defense", variation: "Advance", moves: ["e4", "e6", "d4", "d5", "e5"] },
  { eco: "C10", name: "French Defense", variation: "Classical", moves: ["e4", "e6", "d4", "d5", "Nc3", "Nf6"] },
  { eco: "B10", name: "Caro-Kann Defense", moves: ["e4", "c6"] },
  { eco: "B12", name: "Caro-Kann Defense", variation: "Advance", moves: ["e4", "c6", "d4", "d5", "e5"] },
  { eco: "B18", name: "Caro-Kann Defense", variation: "Classical", moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5"] },
  { eco: "B01", name: "Scandinavian Defense", moves: ["e4", "d5"] },
  { eco: "B02", name: "Alekhine Defense", moves: ["e4", "Nf6"] },
  { eco: "B06", name: "Modern Defense", moves: ["e4", "g6", "d4", "Bg7"] },
  { eco: "B07", name: "Pirc Defense", moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6"] },
  { eco: "C40", name: "King's Knight Opening", moves: ["e4", "e5", "Nf3"] },
  { eco: "C41", name: "Philidor Defense", moves: ["e4", "e5", "Nf3", "d6"] },
  { eco: "C42", name: "Petrov Defense", moves: ["e4", "e5", "Nf3", "Nf6"] },
  { eco: "C44", name: "King's Pawn Game", moves: ["e4", "e5", "Nf3", "Nc6"] },
  { eco: "C45", name: "Scotch Game", moves: ["e4", "e5", "Nf3", "Nc6", "d4"] },
  { eco: "C46", name: "Three Knights Game", moves: ["e4", "e5", "Nf3", "Nc6", "Nc3"] },
  { eco: "C47", name: "Four Knights Game", moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6"] },
  { eco: "C46", name: "Göring Gambit", moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6", "d4", "exd4"] },
  { eco: "C50", name: "Italian Game", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
  { eco: "C50", name: "Italian Game", variation: "Giuoco Piano", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"] },
  { eco: "C53", name: "Italian Game", variation: "Giuoco Piano main", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6"] },
  { eco: "C51", name: "Evans Gambit", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "b4"] },
  { eco: "C60", name: "Ruy Lopez", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"] },
  { eco: "C67", name: "Ruy Lopez", variation: "Berlin Defense", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"] },
  { eco: "C68", name: "Ruy Lopez", variation: "Exchange", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6"] },
  { eco: "C88", name: "Ruy Lopez", variation: "Closed", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"] },
  { eco: "C92", name: "Ruy Lopez", variation: "Zaitsev", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O", "h3", "Re8"] },
  { eco: "C20", name: "King's Pawn Game", moves: ["e4", "e5"] },
  { eco: "C23", name: "Bishop's Opening", moves: ["e4", "e5", "Bc4"] },
  { eco: "C25", name: "Vienna Game", moves: ["e4", "e5", "Nc3"] },
  { eco: "C26", name: "Vienna Game", variation: "Falkbeer", moves: ["e4", "e5", "Nc3", "Nf6", "f4"] },
  { eco: "C30", name: "King's Gambit", moves: ["e4", "e5", "f4"] },
  { eco: "C33", name: "King's Gambit Accepted", moves: ["e4", "e5", "f4", "exf4"] },
  { eco: "C36", name: "King's Gambit", variation: "Classical", moves: ["e4", "e5", "f4", "exf4", "Nf3", "d5"] },
  { eco: "D00", name: "Queen's Pawn Game", moves: ["d4", "d5"] },
  { eco: "D06", name: "Queen's Gambit", moves: ["d4", "d5", "c4"] },
  { eco: "D10", name: "Queen's Gambit Accepted", moves: ["d4", "d5", "c4", "dxc4"] },
  { eco: "D12", name: "Queen's Gambit Declined", moves: ["d4", "d5", "c4", "e6"] },
  { eco: "D30", name: "Queen's Gambit Declined", variation: "Tarrasch", moves: ["d4", "d5", "c4", "e6", "Nc3", "c5"] },
  { eco: "D37", name: "Queen's Gambit Declined", moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Nf3", "Be7"] },
  { eco: "D15", name: "Slav Defense", moves: ["d4", "d5", "c4", "c6"] },
  { eco: "D17", name: "Slav Defense", variation: "Marshall", moves: ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "dxc4", "a4"] },
  { eco: "D70", name: "Grünfeld Defense", moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5"] },
  { eco: "E60", name: "King's Indian Defense", moves: ["d4", "Nf6", "c4", "g6"] },
  { eco: "E61", name: "King's Indian Defense", moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"] },
  { eco: "E97", name: "King's Indian Defense", variation: "Classical", moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O", "Be2", "e5", "O-O", "Nc6", "d5"] },
  { eco: "E12", name: "Queen's Indian Defense", moves: ["d4", "Nf6", "c4", "e6", "Nf3", "b6"] },
  { eco: "E32", name: "Nimzo-Indian Defense", moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"] },
  { eco: "E20", name: "Nimzo-Indian Defense", variation: "Kmoch", moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4", "f3"] },
  { eco: "E06", name: "Catalan Opening", moves: ["d4", "Nf6", "c4", "e6", "g3", "d5"] },
  { eco: "E04", name: "Catalan Opening", variation: "Open", moves: ["d4", "Nf6", "c4", "e6", "g3", "d5", "Nf3", "dxc4", "Bg2"] },
  { eco: "A46", name: "London System", moves: ["d4", "Nf6", "Nf3", "e6", "Bf4"] },
  { eco: "A45", name: "Torre Attack", moves: ["d4", "Nf6", "Nf3", "e6", "Bg5"] },
  { eco: "A40", name: "Queen's Pawn", variation: "Sokolsky/Orangutan", moves: ["b4"] },
  { eco: "A40", name: "Modern Defense", moves: ["d4", "g6"] },
  { eco: "A80", name: "Dutch Defense", moves: ["d4", "f5"] },
  { eco: "A85", name: "Dutch Defense", variation: "Radman", moves: ["d4", "f5", "c4", "Nf6", "Nc3"] },
  { eco: "A70", name: "Benoni Defense", moves: ["d4", "Nf6", "c4", "c5", "d5", "e6"] },
  { eco: "A10", name: "English Opening", moves: ["c4"] },
  { eco: "A20", name: "English Opening", variation: "Reversed Sicilian", moves: ["c4", "e5"] },
  { eco: "A25", name: "English Opening", variation: "Closed", moves: ["c4", "e5", "Nc3", "Nf6"] },
  { eco: "A29", name: "English Opening", variation: "Four Knights", moves: ["c4", "e5", "Nc3", "Nf6", "Nf3", "Nc6"] },
  { eco: "A13", name: "English Opening", variation: "Agincourt", moves: ["c4", "e6", "Nf3", "d5"] },
  { eco: "A04", name: "Réti Opening", moves: ["Nf3"] },
  { eco: "A09", name: "Réti Opening", variation: "Advance", moves: ["Nf3", "d5", "c4", "e6"] },
  { eco: "A06", name: "Benko Opening", moves: ["Nf3", "d5"] },
  { eco: "A01", name: "Larsen's Opening", moves: ["b3"] },
  { eco: "B00", name: "King's Pawn", moves: ["e4"] },
  { eco: "A00", name: "Queen's Pawn", moves: ["d4"] },
];

export type OpeningMatch = {
  eco: string;
  name: string;
  variation?: string;
  /** Number of plies matched. */
  plies: number;
  /** True when the game followed this line to its end in the index. */
  complete: boolean;
};

/**
 * Detect the opening from a game's SAN list.
 * Returns the longest matching prefix across the index.
 */
export function detectOpening(sanList: string[]): OpeningMatch | null {
  let best: OpeningMatch | null = null;

  for (const entry of OPENING_INDEX) {
    if (entry.moves.length === 0) continue;
    let matched = 0;
    while (matched < entry.moves.length && matched < sanList.length) {
      if (entry.moves[matched] !== sanList[matched]) break;
      matched++;
    }
    if (matched >= 2 && (!best || matched > best.plies)) {
      best = {
        eco: entry.eco,
        name: entry.name,
        variation: entry.variation,
        plies: matched,
        complete: matched === entry.moves.length,
      };
    }
  }
  return best;
}
