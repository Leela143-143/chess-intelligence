import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import Piece, { PIECE_NAMES, PROMOTION_CHOICES, type PieceType } from "./Piece";

/**
 * ChessBoard — the hero object of the product (brief §7–§9, §46, §48, §56).
 *
 * Interaction: tap-select / tap-move, pointer drag (mouse + touch), pointer
 * hover read-out, tap-target dots, promotion chooser, and a full keyboard
 * grid (arrow keys move a roving focus, Enter selects, Escape cancels).
 *
 * Staging: because pieces are vector elements, a capture is *animated* (the
 * victim leaves while the mover lands heavier), checks and mates fire a
 * board-level event, promotions cross-fade, and a critical moment can bracket
 * its squares. Animation is suppressed by `html[data-motion="reduced"]`.
 *
 * Presentation: square colours, coordinates, piece sets, board depth and
 * evaluation illumination are all CSS tokens (styles/tokens.css, app.css).
 */

const FILES = "abcdefgh";
const RANKS = "12345678";

export type LastMove = { from: string; to: string } | null;

export type BoardArrow = {
  from: string;
  to: string;
  tone?: "accent" | "warn" | "neg" | "steel";
};

export type ChessBoardProps = {
  fen: string;
  orientation?: "white" | "black";
  interactive?: boolean;
  lastMove?: LastMove;
  showCoords?: boolean;
  /** Evaluation illumination under the board. */
  advantage?: "white" | "black" | null;
  /** Squares to mark as the critical moment (corner brackets). */
  bracketSquares?: string[];
  /** Quiet trail of previously visited squares. */
  trailSquares?: string[];
  /** Candidate-move arrows (best move, mistake, …). */
  arrows?: BoardArrow[];
  /** Raw FEN of the previous displayed position; enables capture staging. */
  previousFen?: string | null;
  onMove?: (from: Square, to: Square, promotion: PieceSymbol | null) => boolean | void;
  onHoverSquare?: (square: string | null) => void;
};

type PieceInfo = { type: PieceType; color: Color };
type DragState = {
  from: Square;
  pieceKey: string;
  color: Color;
  x: number;
  y: number;
  moved: boolean;
  pointerId: number;
};

const key = (info: PieceInfo) => `${info.color}${info.type}`;

function pieceMapOf(fen: string): Map<string, PieceInfo> {
  const map = new Map<string, PieceInfo>();
  try {
    for (const entry of new Chess(fen).board().flat()) {
      if (entry) map.set(entry.square, { type: entry.type as PieceType, color: entry.color });
    }
  } catch {
    /* unparseable FEN → empty board */
  }
  return map;
}

export default function ChessBoard({
  fen,
  orientation = "white",
  interactive = true,
  lastMove = null,
  showCoords = true,
  advantage = null,
  bracketSquares,
  trailSquares,
  arrows,
  previousFen = null,
  onMove,
  onHoverSquare,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null);
  const [focusSquare, setFocusSquare] = useState<Square>("e2");
  const [leaving, setLeaving] = useState<Map<string, PieceInfo>>(new Map());
  const [entering, setEntering] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<Square | null>(null);

  const position = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const pieces = useMemo(() => pieceMapOf(fen), [fen]);
  const turn = position?.turn() ?? "w";

  const checkSquare = useMemo(() => {
    if (!position || !position.inCheck()) return null;
    for (const [square, info] of pieces) {
      if (info.type === "k" && info.color === turn) return square;
    }
    return null;
  }, [position, pieces, turn]);

  const legalTargets = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!selected || !position) return map;
    try {
      for (const move of position.moves({ square: selected, verbose: true })) {
        map.set(move.to, move.captured !== undefined || move.flags.includes("e"));
      }
    } catch {
      /* ignore */
    }
    return map;
  }, [selected, position]);

  /* ------------------------------------------------ staging (animation) */
  const prevFenRef = useRef<string | null>(previousFen);
  useEffect(() => {
    const from = prevFenRef.current;
    prevFenRef.current = fen;
    if (!from || from === fen) return;
    const before = pieceMapOf(from);
    const after = pieces;
    const gone = new Map<string, PieceInfo>();
    const arrived = new Set<string>();
    for (const [square, info] of before) {
      if (!after.has(square)) gone.set(square, info);
    }
    for (const [square, info] of after) {
      const was = before.get(square);
      if (!was || key(was) !== key(info)) arrived.add(square);
    }
    if (gone.size === 0 && arrived.size === 0) return;
    setLeaving(gone);
    setEntering(arrived);
    const t = window.setTimeout(() => {
      setLeaving(new Map());
      setEntering(new Set());
    }, 240);
    return () => window.clearTimeout(t);
  }, [fen, pieces]);

  // Board-level event (check / mate) driven by the position itself.
  const boardEvent = useMemo(() => {
    if (!position) return "none";
    if (position.isCheckmate()) return "mate";
    if (position.inCheck()) return "check";
    return "none";
  }, [position]);

  // Reset transient selection when the position changes externally.
  const lastFen = useRef(fen);
  useEffect(() => {
    if (lastFen.current !== fen) {
      lastFen.current = fen;
      setSelected(null);
      setPending(null);
    }
  }, [fen]);

  /* --------------------------------------------------------- geometry */
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
      const moving = pieces.get(from);
      if (!moving) return false;
      const isPromotion =
        moving.type === "p" &&
        ((moving.color === "w" && to[1] === "8") || (moving.color === "b" && to[1] === "1"));
      if (isPromotion) {
        setPending({ from, to });
        setSelected(null);
        return true;
      }
      const result = onMove?.(from, to, null);
      setSelected(null);
      return result !== false;
    },
    [position, pieces, onMove],
  );

  const completePromotion = useCallback(
    (choice: PieceType) => {
      if (!pending) return;
      onMove?.(pending.from, pending.to, choice === "q" ? null : choice);
      setPending(null);
      setSelected(null);
    },
    [pending, onMove],
  );

  /* -------------------------------------------------- pointer handling */
  const handlePointerDown = (event: ReactPointerEvent, square: Square) => {
    if (!interactive || !position) return;
    const piece = pieces.get(square);

    if (selected && legalTargets.has(square)) {
      attemptMove(selected, square);
      return;
    }
    if (piece && piece.color === turn) {
      event.preventDefault();
      setSelected(square);
      setFocusSquare(square);
      setDrag({
        from: square,
        pieceKey: key(piece),
        color: piece.color,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        pointerId: event.pointerId,
      });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    setSelected(null);
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

  /* -------------------------------------------------- keyboard grid */
  const moveFocus = useCallback(
    (from: Square, dc: number, dr: number) => {
      const file = FILES.indexOf(from[0] as string) + dc * (orientation === "white" ? 1 : -1);
      const rank = Number(from[1]) - 1 + dr * (orientation === "white" ? 1 : -1);
      if (file < 0 || file > 7 || rank < 0 || rank > 7) return;
      const next = `${FILES[file]}${RANKS[rank]}` as Square;
      setFocusSquare(next);
      const el = boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${next}"]`);
      el?.focus();
    },
    [orientation],
  );

  const handleKeyDown = (event: React.KeyboardEvent, square: Square) => {
    if (!interactive) return;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(square, -1, 0);
        return;
      case "ArrowRight":
        event.preventDefault();
        moveFocus(square, 1, 0);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(square, 0, 1);
        return;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(square, 0, -1);
        return;
      case "Escape":
        setSelected(null);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const piece = pieces.get(square);
        if (selected && legalTargets.has(square)) {
          attemptMove(selected, square);
        } else if (piece && piece.color === turn) {
          setSelected((current) => (current === square ? null : square));
        } else {
          setSelected(null);
        }
        return;
      }
      default:
    }
  };

  /* -------------------------------------------------- render squares */
  const bracketSet = useMemo(() => new Set(bracketSquares ?? []), [bracketSquares]);
  const trailSet = useMemo(() => new Set(trailSquares ?? []), [trailSquares]);

  const rows: React.ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    const cells: React.ReactNode[] = [];
    for (let col = 0; col < 8; col++) {
      const square = visualToSquare(col, row);
      if (!square) continue;
      const isLight = (FILES.indexOf(square[0] as string) + Number(square[1])) % 2 === 0;
      const piece = pieces.get(square);
      const isTarget = legalTargets.has(square);
      const isCapture = isTarget && (Boolean(piece) || legalTargets.get(square) === true);
      const isLast = Boolean(lastMove && (lastMove.from === square || lastMove.to === square));
      const dragging = drag?.moved && drag.from === square;
      const gone = leaving.get(square);
      const arrived = entering.has(square);

      const classes = [
        "square",
        isLight ? "light" : "dark",
        isLast ? "last" : "",
        selected === square ? "selected" : "",
        trailSet.has(square) && !isLast ? "trail" : "",
        checkSquare === square ? "check" : "",
        isTarget ? "target" : "",
        isCapture ? "capture" : "",
        bracketSet.has(square) ? "bracketed" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const labels = [
        square,
        piece ? `${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}` : "empty",
        isTarget ? "legal destination" : "",
        selected === square ? "selected" : "",
        checkSquare === square ? "king in check" : "",
      ]
        .filter(Boolean)
        .join(", ");

      cells.push(
        <button
          key={square}
          type="button"
          role="gridcell"
          data-square={square}
          className={classes}
          aria-label={labels}
          aria-selected={selected === square}
          data-hover={hovered === square ? "1" : undefined}
          tabIndex={focusSquare === square ? 0 : -1}
          onPointerDown={(event) => handlePointerDown(event, square)}
          onFocus={() => setFocusSquare(square)}
          onKeyDown={(event) => handleKeyDown(event, square)}
          onPointerEnter={() => {
            setHovered(square);
            onHoverSquare?.(square);
          }}
          onPointerLeave={() => {
            setHovered((current) => (current === square ? null : current));
            onHoverSquare?.(null);
          }}
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
          {gone && (
            <span
              style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}
            >
              <Piece
                type={gone.type}
                color={gone.color}
                className="leaving"
              />
            </span>
          )}
          {piece && (
            <Piece
              type={piece.type}
              color={piece.color}
              className={
                [
                  dragging ? "dragging" : "",
                  arrived ? "entering" : "",
                  pending && pending.to === square ? "promoting" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            />
          )}
          {piece && dragging && (
            <span className="sr-only">being dragged</span>
          )}
        </button>,
      );
    }
    rows.push(
      <div key={row} className="boardrow" role="row">
        {cells}
      </div>,
    );
  }

  const ghost = drag?.moved ? drag : null;

  /* squares → viewBox units for the arrow overlay */
  const arrowShapes = (arrows ?? []).map((arrow, index) => {
    const idx = (sq: string) => {
      const file = FILES.indexOf(sq[0] as string);
      const rank = Number(sq[1]) - 1;
      const col = orientation === "white" ? file : 7 - file;
      const row = orientation === "white" ? 7 - rank : rank;
      return { x: col + 0.5, y: row + 0.5 };
    };
    const a = idx(arrow.from);
    const b = idx(arrow.to);
    // Shorten the line so the head sits inside the target square.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const shrink = 0.32;
    const x2 = b.x - (dx / len) * shrink;
    const y2 = b.y - (dy / len) * shrink;
    const tone = arrow.tone ?? "accent";
    return (
      <g key={`${arrow.from}${arrow.to}${index}`} data-tone={tone}>
        <line x1={a.x} y1={a.y} x2={x2} y2={y2} />
        <circle cx={x2} cy={y2} r={0.19} />
      </g>
    );
  });

  return (
    <div className="board-shell">
      <div className="board-stage">
        <div className="board-frame" data-event={boardEvent}>
          <div className="board-illum" data-adv={advantage ?? "none"} />
          <div
            ref={boardRef}
            className="chessboard"
            role="grid"
            aria-label={`Chessboard, ${orientation === "white" ? "white" : "black"} at the bottom`}
            onContextMenu={(event) => event.preventDefault()}
          >
            {rows}
          </div>

          {arrowShapes.length > 0 && (
            <svg
              className="board-arrows"
              viewBox="0 0 8 8"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {arrowShapes}
            </svg>
          )}

          {pending && (
            <div className="promo-chooser" role="dialog" aria-label="Choose promotion piece">
              <div className="eyebrow">Promote to</div>
              <div className="choices">
                {PROMOTION_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => completePromotion(choice)}
                    aria-label={`Promote to ${PIECE_NAMES[choice]}`}
                  >
                    <Piece type={choice} color={turn} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {ghost && (
        <span
          className="drag-ghost"
          style={{ left: ghost.x, top: ghost.y }}
          aria-hidden="true"
        >
          <Piece
            type={ghost.pieceKey[1] as PieceType}
            color={ghost.color}
          />
        </span>
      )}

    </div>
  );
}
