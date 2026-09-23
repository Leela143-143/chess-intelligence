import { START_FEN, sanLineToUci } from "./chess/replay";

/**
 * Built-in demo game (brief §54).
 *
 * A short, real, verifiable miniature so a first-time visitor can experience
 * the whole pipeline — engine, review, The Moment, training — without
 * importing anything. The SAN is replayed through chess.js at load time; a
 * unit test asserts every move is legal, so the demo can never silently rot.
 *
 * Scholar's mate: the decisive moment is 3…Nf6?? which walks into mate.
 */
export const DEMO_GAME = {
  id: "demo",
  name: "Scholar's mate",
  white: "Demo White",
  black: "Demo Black",
  result: "1-0",
  /** The side the demo is told from — the player who blunders. */
  perspective: "b" as const,
  sans: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
  get uci(): string[] {
    return sanLineToUci(START_FEN, this.sans);
  },
};

export type DemoGame = typeof DEMO_GAME;
