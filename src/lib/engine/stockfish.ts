import type {
  AnalyzeOptions,
  ChessEngine,
  EngineEvaluation,
  EngineLine,
} from "./types";
import { AnalysisAbortedError, EngineUnavailableError } from "./types";
import { ENGINE_BUILD } from "./buildInfo";
import {
  normalizeToWhite,
  parseBestMoveLine,
  parseInfoLine,
  sideToMoveFromFen,
} from "./uci";

/** URL of the Stockfish worker script (copied to public/ by scripts/copy-stockfish.mjs). */
export const STOCKFISH_WORKER_URL: string = ENGINE_BUILD.workerPath;

const HANDSHAKE_TIMEOUT_MS = 15_000;

type PendingSearch = {
  resolve: (evaluation: EngineEvaluation) => void;
  reject: (error: Error) => void;
  fen: string;
  wantedDepth: number;
  multiPv: number;
  lastInfo: ReturnType<typeof parseInfoLine>;
  alternativesByPv: Map<string, EngineLine>;
  signal?: AbortSignal;
  onAbort?: () => void;
};

/**
 * Low-level UCI client. One instance == one worker == one engine process.
 * Never blocks the main thread; all parsing happens here in tiny slices.
 */
export class UciClient {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;
  private disposed = false;
  private pending: PendingSearch | null = null;

  constructor(private readonly workerUrl: string = STOCKFISH_WORKER_URL) {}

  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });
      this.boot();
    }
    return this.readyPromise;
  }

  private boot(): void {
    if (typeof Worker === "undefined") {
      this.readyReject?.(
        new EngineUnavailableError("Web Workers are not supported in this environment."),
      );
      return;
    }
    try {
      this.worker = new Worker(this.workerUrl);
    } catch (err) {
      this.readyReject?.(
        new EngineUnavailableError(
          `Failed to start engine worker: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return;
    }

    const timeout = setTimeout(() => {
      this.readyReject?.(
        new EngineUnavailableError("Engine handshake timed out (uciok not received)."),
      );
    }, HANDSHAKE_TIMEOUT_MS);

    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      const line = typeof event.data === "string" ? event.data : "";
      if (!line) return;

      if (line === "uciok") {
        clearTimeout(timeout);
        this.send("isready");
        // `readyok` confirms full initialization.
        return;
      }
      if (line === "readyok") {
        clearTimeout(timeout);
        this.readyResolve?.();
        return;
      }
      this.handleLine(line);
    };

    this.worker.onerror = (event: ErrorEvent) => {
      clearTimeout(timeout);
      const message = event.message || "engine worker error";
      if (!this.readySettled()) {
        this.readyReject?.(new EngineUnavailableError(message));
      } else if (this.pending) {
        this.failPending(new EngineUnavailableError(message));
      }
    };

    this.send("uci");
  }

  private readySettled(): boolean {
    return Boolean(this.readyResolve === null && this.readyPromise);
  }

  send(command: string): void {
    this.worker?.postMessage(command);
  }

  private handleLine(line: string): void {
    const pending = this.pending;
    if (!pending) return;

    if (line.startsWith("bestmove")) {
      const best = parseBestMoveLine(line);
      this.settlePending(best);
      return;
    }

    const info = parseInfoLine(line);
    if (!info) return;
    pending.lastInfo = info;

    if (info.pv.length > 0) {
      const top =
        info.scoreCp !== null
          ? { scoreCp: info.scoreCp, mateIn: null }
          : { scoreCp: 0, mateIn: info.mateIn };
      const normalized = normalizeToWhite(
        top.scoreCp,
        top.mateIn,
        sideToMoveFromFen(pending.fen),
      );
      const key = info.pv.join(" ");
      pending.alternativesByPv.set(key, {
        multipv: info.multipv,
        scoreCp: normalized.scoreCp,
        mateIn: normalized.mateIn,
        bestMove: info.pv[0] ?? null,
        pv: info.pv,
      });
      // MultiPV cap: keep only the requested number of lines.
      if (pending.alternativesByPv.size > pending.multiPv) {
        const overflow = [...pending.alternativesByPv.keys()].slice(
          0,
          pending.alternativesByPv.size - pending.multiPv,
        );
        for (const k of overflow) pending.alternativesByPv.delete(k);
      }
    }
  }

  private settlePending(best: ReturnType<typeof parseBestMoveLine>): void {
    const pending = this.pending;
    if (!pending) return;
    this.cleanupPending();

    const info = pending.lastInfo;
    const side = sideToMoveFromFen(pending.fen);
    const rawCp = info?.scoreCp ?? 0;
    const rawMate = info?.mateIn ?? null;
    const normalized = normalizeToWhite(rawCp, rawMate, side);

    const all = [...pending.alternativesByPv.values()].sort(
      (a, b) => a.multipv - b.multipv,
    );
    const primary = all[0];
    const alternatives = all.filter((line) => line.multipv > 1);

    pending.resolve({
      fen: pending.fen,
      bestMove: best?.bestMove ?? primary?.bestMove ?? null,
      ponder: best?.ponder ?? null,
      scoreCp: primary ? primary.scoreCp : normalized.scoreCp,
      mateIn: primary ? primary.mateIn : normalized.mateIn,
      depth: info?.depth ?? 0,
      pv: primary?.pv ?? info?.pv ?? [],
      alternatives,
      nodes: info?.nodes ?? 0,
      timeMs: info?.timeMs ?? 0,
    });
  }

  private cleanupPending(): void {
    if (this.pending?.onAbort && this.pending.signal) {
      this.pending.signal.removeEventListener("abort", this.pending.onAbort);
    }
    this.pending = null;
  }

  private failPending(error: Error): void {
    const pending = this.pending;
    if (!pending) return;
    this.cleanupPending();
    pending.reject(error);
  }

  /** Analyze a position; resolves on `bestmove`. */
  analyze(options: AnalyzeOptions): Promise<EngineEvaluation> {
    if (this.disposed) {
      return Promise.reject(new EngineUnavailableError("Engine disposed"));
    }
    if (this.pending) {
      // One search per engine process; supersede gracefully.
      this.stop();
    }

    return this.ready().then(
      () =>
        new Promise<EngineEvaluation>((resolve, reject) => {
          const pending: PendingSearch = {
            resolve,
            reject,
            fen: options.fen,
            wantedDepth: options.depth ?? 16,
            multiPv: options.multiPv ?? 1,
            lastInfo: null,
            alternativesByPv: new Map(),
            signal: options.signal,
          };

          if (options.signal) {
            if (options.signal.aborted) {
              reject(new AnalysisAbortedError());
              return;
            }
            pending.onAbort = () => {
              if (this.pending === pending) {
                this.send("stop");
                // bestmove will arrive and settle normally with partial info.
              }
            };
            options.signal.addEventListener("abort", pending.onAbort, { once: true });
          }

          this.pending = pending;

          this.send(`setoption name MultiPV value ${Math.max(1, pending.multiPv)}`);
          this.send(`position fen ${options.fen}`);
          const timeCtl = options.movetimeMs
            ? `movetime ${Math.max(1, Math.floor(options.movetimeMs))}`
            : `depth ${Math.max(1, pending.wantedDepth)}`;
          this.send(`go ${timeCtl}`);
        }),
    );
  }

  stop(): void {
    if (this.pending) this.send("stop");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pending) this.failPending(new AnalysisAbortedError("Engine disposed"));
    try {
      this.send("quit");
    } catch {
      /* worker may already be gone */
    }
    this.worker?.terminate();
    this.worker = null;
    this.readyReject?.(new EngineUnavailableError("Engine disposed"));
  }
}

/** Stockfish implementation of the ChessEngine interface (npm `stockfish`, v19 line). */
export class StockfishEngine implements ChessEngine {
  readonly name = "Stockfish (WASM)";
  private readonly uci: UciClient;

  constructor(workerUrl?: string) {
    this.uci = new UciClient(workerUrl);
  }

  ready(): Promise<void> {
    return this.uci.ready();
  }

  analyze(options: AnalyzeOptions): Promise<EngineEvaluation> {
    return this.uci.analyze(options);
  }

  stop(): void {
    this.uci.stop();
  }

  dispose(): void {
    this.uci.dispose();
  }
}
