import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

/**
 * ChessBoard — the central product feature (spec §56–58, §62).
 *
 * - Tap-to-select/tap-to-move AND pointer drag (mouse/touch)
 * - Board orientation, last-move & check highlights, legal-move dots
 * - Coordinates, promotion chooser
 * - Piece sets / board themes via CSS (body[data-pieces], [data-board])
 * - Accessible: every square is a labelled button; keyboard operable
 */

const FILES = "abcdefgh";

export type LastMove = { from: string; to: string } | null;

export type ChessBoardProps = {
  fen: string;
  orientation?: "white" | "black";
  interactive?: boolean;
  lastMove?: LastMove;
  showCoords?: boolean;
  /** Return false to reject a attempted move (e.g. engine says no). */
  onMove?: (from: Square, to: Square, promotion: PieceSymbol | null) => boolean | void;
};

const GLYPHS: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};

const NAMES: Record<PieceSymbol, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};

type DragState = {
  from: Square;
  pieceKey: string;
  x: number;
  y: number;
  moved: boolean;
  pointerId: number;
};

type PendingPromotion = { from: Square; to: Square };

export default function ChessBoard({
  fen,
  orientation = "white",
  interactive = true,
  lastMove = null,
  showCoords = true,
  onMove,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const position = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const pieceAt = useMemo(() => {
    const map = new Map<Square, { type: PieceSymbol; color: Color }>();
    if (!position) return map;
    for (const row of position.board()) {
      for (const entry of row) {
        if (entry) map.set(entry.square, { type: entry.type, color: entry.color });
      }
    }
    return map;
  }, [position]);

  const turn = position?.turn() ?? "w";
  const checkSquare = useMemo(() => {
    if (!position || !position.inCheck()) return null;
    for (const [square, piece] of pieceAt) {
      if (piece.type === "k" && piece.color === turn) return square;
    }
    return null;
  }, [position, pieceAt, turn]);

  const legalTargets = useMemo(() => {
    if (!selected || !position) return new Map<Square, boolean>();
    const map = new Map<Square, boolean>();
    for (const move of position.moves({ square: selected, verbose: true })) {
      map.set(move.to, move.captured !== undefined || move.flags.includes("e"));
    }
    return map;
  }, [selected, position]);

  // Reset selection when the position changes externally.
  const lastFen = useRef(fen);
  useEffect(() => {
    if (lastFen.current !== fen) {
      lastFen.current = fen;
      setSelected(null);
      setPendingPromotion(null);
    }
  }, [fen]);

  const visualToSquare = useCallback(
    (col: number, row: number): Square | null => {
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      const file = orientation === "white" ? col : 7 - col;
      const rank = orientation === "white" ? 7 - row : row;
      return `${FILES[file]}${rank + 1}` as Square;
    },
    [orientation],
  );

  const squareFromPoint = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      return visualToSquare(col, row);
    },
    [visualToSquare],
  );

  const attemptMove = useCallback(
    (from: Square, to: Square): boolean => {
      if (!position) return false;
      const moving = position.get(from);
      if (!moving) return false;
      const isPromotion =
        moving.type === "p" &&
        ((moving.color === "w" && to[1] === "8") || (moving.color === "b" && to[1] === "1"));
      if (isPromotion) {
        setPendingPromotion({ from, to });
        return true;
      }
      const result = onMove?.(from, to, null);
      if (result === false) return false;
      return true;
    },
    [position, onMove],
  );

  const completePromotion = useCallback(
    (piece: PieceSymbol) => {
      if (!pendingPromotion) return;
      onMove?.(pendingPromotion.from, pendingPromotion.to, piece === "q" ? null : piece);
      setPendingPromotion(null);
    },
    [pendingPromotion, onMove],
  );

  /* ------------------------------------------------ pointer interactions */
  const handlePointerDown = (event: React.PointerEvent, square: Square) => {
    if (!interactive || !position) return;
    const piece = pieceAt.get(square);

    if (selected && legalTargets.has(square)) {
      attemptMove(selected, square);
      return;
    }

    if (piece && piece.color === turn) {
      event.preventDefault();
      setSelected(square);
      setDrag({
        from: square,
        pieceKey: `${piece.color}${piece.type}`,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        pointerId: event.pointerId,
      });
    } else {
      setSelected(null);
    }
  };

  useEffect(() => {
    if (!drag) return;

    const onMoveEvent = (event: PointerEvent) => {
      setDrag((current) => {
        if (!current || event.pointerId !== current.pointerId) return current;
        const moved =
          current.moved ||
          Math.abs(event.clientX - current.x) > 6 ||
          Math.abs(event.clientY - current.y) > 6;
        return { ...current, x: event.clientX, y: event.clientY, moved };
      });
    };

    const onUpEvent = (event: PointerEvent) => {
      setDrag((current) => {
        if (!current || event.pointerId !== current.pointerId) return null;
        if (current.moved) {
          const target = squareFromPoint(event.clientX, event.clientY);
          if (target && target !== current.from) attemptMove(current.from, target);
        }
        return null;
      });
    };

    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUpEvent);
    window.addEventListener("pointercancel", onUpEvent);
    return () => {
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUpEvent);
      window.removeEventListener("pointercancel", onUpEvent);
    };
  }, [drag, squareFromPoint, attemptMove]);

  /* ------------------------------------------------ render */
  const squares: React.ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = visualToSquare(col, row);
      if (!square) continue;
      const isLight = (FILES.indexOf(square[0]!) + Number(square[1])) % 2 === 0;
      const piece = pieceAt.get(square);
      const isTarget = legalTargets.has(square);
      const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
      const isDragging = drag?.moved && drag.from === square;
      const classes = [
        "square",
        isLight ? "light" : "dark",
        isLast ? "last" : "",
        selected === square ? "selected" : "",
        checkSquare === square ? "check" : "",
        isTarget ? "target" : "",
        isTarget && (piece || legalTargets.get(square)) ? "capture" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const pieceName = piece ? `, ${piece.color === "w" ? "white" : "black"} ${NAMES[piece.type]}` : "";

      squares.push(
        <button
          key={square}
          type="button"
          className={classes}
          aria-label={`${square}${pieceName}`}
          onPointerDown={(event) => handlePointerDown(event, square)}
        >
          {showCoords && col === 0 && (
            <span className="coord rank">{orientation === "white" ? 8 - row : row + 1}</span>
          )}
          {showCoords && row === 7 && (
            <span className="coord file">
              {orientation === "white" ? FILES[col] : FILES[7 - col]}
            </span>
          )}
          {isTarget && <span className="dot" />}
          {piece && (
            <span
              className={`piece ${piece.color === "w" ? "white" : "black"}`}
              style={isDragging ? { opacity: 0.25 } : undefined}
              aria-hidden="true"
            >
              {GLYPHS[`${piece.color}${piece.type}`]}
            </span>
          )}
        </button>,
      );
    }
  }

  const ghostPiece = drag?.moved && drag.pieceKey ? GLYPHS[drag.pieceKey] : null;

  return (
    <div className="board-wrap">
      <div
        ref={boardRef}
        className="chessboard"
        role="grid"
        aria-label="Chessboard"
        onContextMenu={(event) => event.preventDefault()}
      >
        {squares}

        {pendingPromotion && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(8,9,13,0.82)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              zIndex: 10,
              flexDirection: "column",
              padding: 12,
              textAlign: "center",
            }}
          >
            <div className="small dim">Promote pawn to</div>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              {(["q", "r", "b", "n"] as PieceSymbol[]).map((p) => (
                <button
                  key={p}
                  className="btn"
                  style={{ fontSize: "1.6rem", minWidth: 52 }}
                  onClick={() => completePromotion(p)}
                  aria-label={`Promote to ${NAMES[p]}`}
                >
                  {GLYPHS[`${turn}${p}`]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {ghostPiece && drag && (
        <span
          className={`piece drag-ghost ${drag.pieceKey.startsWith("w") ? "white" : "black"}`}
          style={{ left: drag.x, top: drag.y }}
        >
          {ghostPiece}
        </span>
      )}
    </div>
  );
}
