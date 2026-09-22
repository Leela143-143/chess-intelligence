import { useCallback, useMemo, useState } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { LastMove } from "@/components/ChessBoard";
import type { PgnHeaders } from "@/lib/chess/pgn";

/**
 * Shared chess game model used by the analysis board and the game view.
 * Keeps SAN/UCI/FEN arrays in sync, handles navigation and move input.
 */

export type MoveInput = { san: string; uci: string };

export type ChessGameModel = {
  sans: string[];
  uci: string[];
  fens: string[];
  viewPly: number;
  /** FEN of the position currently displayed. */
  fen: string;
  lastMove: LastMove;
  atTail: boolean;
  headers: PgnHeaders | null;
  /** Attempt a board move at the live tail. Returns the move or null. */
  tryMove: (from: Square, to: Square, promotion: PieceSymbol | null) => MoveInput | null;
  /** Navigate: 0 = start position, sans.length = final position. */
  go: (ply: number) => void;
  /** Load a new line from move lists (startFen defaults to standard). */
  load: (moves: { sans: string[]; uci: string[]; startFen?: string; headers?: PgnHeaders }) => void;
  /** Reset to a FEN (defaults to the standard start position). */
  reset: (fen?: string) => void;
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function replayFens(startFen: string, uciMoves: string[]): { fens: string[]; sans: string[] } {
  const fens: string[] = [startFen];
  const sans: string[] = [];
  try {
    const chess = new Chess(startFen);
    for (const uci of uciMoves) {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? (uci.slice(4, 5) as PieceSymbol) : undefined,
      });
      if (!move) break;
      sans.push(move.san);
      fens.push(chess.fen());
    }
  } catch {
    /* invalid start FEN: stay at start */
  }
  return { fens, sans };
}

export function useChessGame(
  initial?: { sans?: string[]; uci?: string[]; startFen?: string; headers?: PgnHeaders },
): ChessGameModel {
  const startFen = initial?.startFen ?? START_FEN;
  const initialReplay = useMemo(
    () => replayFens(startFen, initial?.uci ?? []),
     
    [],
  );

  const [sans, setSans] = useState<string[]>(initial?.sans ?? initialReplay.sans);
  const [uci, setUci] = useState<string[]>(initial?.uci ?? []);
  const [fens, setFens] = useState<string[]>(
    initial?.uci ? initialReplay.fens : [startFen],
  );
  const [viewPly, setViewPly] = useState<number>((initial?.uci ?? []).length);
  const [headers, setHeaders] = useState<PgnHeaders | null>(initial?.headers ?? null);

  const atTail = viewPly === sans.length;

  const fen = fens[Math.min(viewPly, fens.length - 1)] ?? startFen;

  const lastMove: LastMove = useMemo(() => {
    if (viewPly === 0) return null;
    const index = viewPly - 1;
    const played = uci[index];
    if (!played) return null;
    return { from: played.slice(0, 2), to: played.slice(2, 4) };
  }, [viewPly, uci]);

  const tryMove = useCallback(
    (from: Square, to: Square, promotion: PieceSymbol | null): MoveInput | null => {
      // Only allow moves at the live tail (no branching in view mode).
      if (viewPly !== sans.length) return null;
      const currentFen = fens[fens.length - 1];
      if (!currentFen) return null;
      try {
        const chess = new Chess(currentFen);
        const move = chess.move({ from, to, promotion: promotion ?? undefined });
        const uciMove = `${from}${to}${promotion ?? ""}`;
        setSans((list) => [...list, move.san]);
        setUci((list) => [...list, uciMove]);
        setFens((list) => [...list, chess.fen()]);
        setViewPly((ply) => ply + 1);
        return { san: move.san, uci: uciMove };
      } catch {
        return null;
      }
    },
    [viewPly, sans.length, fens],
  );

  const go = useCallback(
    (ply: number) => {
      setViewPly(Math.max(0, Math.min(ply, sans.length)));
    },
    [sans.length],
  );

  const load = useCallback(
    (moves: { sans: string[]; uci: string[]; startFen?: string; headers?: PgnHeaders }) => {
      const replay = replayFens(moves.startFen ?? START_FEN, moves.uci);
      setSans(moves.sans.length > 0 ? moves.sans : replay.sans);
      setUci(moves.uci);
      setFens(replay.fens);
      setViewPly(replay.sans.length);
      setHeaders(moves.headers ?? null);
    },
    [],
  );

  const reset = useCallback((fenToUse?: string) => {
    const target = fenToUse ?? START_FEN;
    setSans([]);
    setUci([]);
    setFens([target]);
    setViewPly(0);
    setHeaders(null);
  }, []);

  return { sans, uci, fens, viewPly, fen, lastMove, atTail, headers, tryMove, go, load, reset };
}
