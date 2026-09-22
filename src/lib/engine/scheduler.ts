import type { ChessEngine, EngineEvaluation, JobPriority } from "./types";
import { AnalysisAbortedError, STRENGTH_BUDGETS } from "./types";
import type { AnalysisStrength } from "./types";

/**
 * EngineScheduler (spec §16)
 *
 * Manages: analysis queue, worker count, priority, cancellation, depth and
 * time budget. Never spawns uncontrolled workers.
 *
 * - Priority 1: current position
 * - Priority 2: user-selected move
 * - Priority 3: game review
 * - Priority 4: background historical analysis
 *
 * Battery/thermal strategy (spec §66–67, §92):
 * - pauses starting new work while the document is hidden (configurable)
 * - consults `backgroundPermitted()` (battery + device profile + user setting)
 * - exposes suspension so the local coach and the engine don't fight for CPU
 */

export type SchedulerRequest = {
  fen: string;
  strength: AnalysisStrength;
  priority: JobPriority;
  multiPv?: number;
  depth?: number;
  movetimeMs?: number;
  signal?: AbortSignal;
};

export type SchedulerStats = {
  queueLength: number;
  activeCount: number;
  poolSize: number;
  paused: boolean;
  completed: number;
  failed: number;
};

type Job = SchedulerRequest & {
  seq: number;
  resolve: (evaluation: EngineEvaluation) => void;
  reject: (error: Error) => void;
  engine: ChessEngine | null;
};

export type SchedulerOptions = {
  poolSize: number;
  /** Pause new work when the page is hidden (default true). */
  pauseWhenHidden?: boolean;
  /** Extra gate: return false to suspend background work (battery, profile, settings). */
  backgroundPermitted?: () => boolean;
  /** Factory creating a fresh engine (worker). */
  createEngine: () => ChessEngine;
};

const SUSPENSION_REASONS = new Set(["coach", "battery", "user", "hidden"]);

export class EngineScheduler {
  private queue: Job[] = [];
  private pool: ChessEngine[] = [];
  private active = new Set<Job>();
  private seqCounter = 0;
  private completed = 0;
  private failed = 0;
  private suspended = new Set<string>();
  private disposed = false;
  private readonly pauseWhenHidden: boolean;
  private readonly backgroundPermitted: () => boolean;
  private hiddenHandler: (() => void) | null = null;

  constructor(private readonly options: SchedulerOptions) {
    this.pauseWhenHidden = options.pauseWhenHidden ?? true;
    this.backgroundPermitted = options.backgroundPermitted ?? (() => true);

    if (this.pauseWhenHidden && typeof document !== "undefined") {
      this.hiddenHandler = () => {
        if (document.hidden) {
          this.suspend("hidden");
          // Stop in-flight searches to save battery; jobs requeue at the front.
          for (const job of [...this.active]) this.interrupt(job, true);
        } else {
          this.resume("hidden");
        }
      };
      document.addEventListener("visibilitychange", this.hiddenHandler);
    }
  }

  /** Submit an analysis job. Returned handle can be cancelled. */
  submit(request: SchedulerRequest): { promise: Promise<EngineEvaluation>; cancel: () => void } {
    let job!: Job;
    const promise = new Promise<EngineEvaluation>((resolve, reject) => {
      job = {
        ...request,
        seq: this.seqCounter++,
        resolve,
        reject,
        engine: null,
      };
    });

    if (request.signal?.aborted) {
      return { promise: Promise.reject(new AnalysisAbortedError()), cancel: () => {} };
    }

    const onAbort = () => this.cancel(job);
    request.signal?.addEventListener("abort", onAbort, { once: true });

    this.queue.push(job);
    this.queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    queueMicrotask(() => this.pump());

    return {
      promise,
      cancel: () => this.cancel(job),
    };
  }

  private cancel(job: Job): void {
    const idx = this.queue.indexOf(job);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      job.reject(new AnalysisAbortedError("Cancelled"));
      return;
    }
    if (this.active.has(job)) this.interrupt(job, false);
  }

  /** Stop a running job. `requeue` puts it back at the front (visibility pause). */
  private interrupt(job: Job, requeue: boolean): void {
    const engine = job.engine;
    this.active.delete(job);
    job.engine = null;
    engine?.stop();
    if (requeue) {
      job.seq = -1; // keep front position on resort
      this.queue.unshift(job);
      this.queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    } else {
      job.reject(new AnalysisAbortedError("Stopped"));
    }
  }

  /** Suspend scheduling under a named reason (idempotent per reason). */
  suspend(reason: string): void {
    if (!SUSPENSION_REASONS.has(reason)) {
      throw new Error(`Unknown suspension reason: ${reason}`);
    }
    this.suspended.add(reason);
  }

  resume(reason: string): void {
    this.suspended.delete(reason);
    this.pump();
  }

  isSuspended(): boolean {
    return this.suspended.size > 0;
  }

  private canRun(job: Job): boolean {
    if (this.suspended.size > 0) return false;
    if (job.priority >= 4 && !this.backgroundPermitted()) return false;
    return true;
  }

  private async pump(): Promise<void> {
    if (this.disposed) return;

    while (this.queue.length > 0) {
      const next = this.queue.find((job) => this.canRun(job));
      if (!next) return;

      if (this.active.size >= this.options.poolSize) return;

      const engine = await this.ensureEngine();
      if (!engine) return;

      // Re-validate: job may have been cancelled while awaiting.
      const idx = this.queue.indexOf(next);
      if (idx === -1) continue;
      this.queue.splice(idx, 1);

      this.runJob(next, engine);
    }
  }

  private async ensureEngine(): Promise<ChessEngine | null> {
    const free = this.pool.find((e) => ![...this.active].some((j) => j.engine === e));
    if (free) return free;
    if (this.pool.length >= this.options.poolSize) return null;
    try {
      const engine = this.options.createEngine();
      await engine.ready();
      this.pool.push(engine);
      return engine;
    } catch {
      this.failed += 1;
      return null;
    }
  }

  private runJob(job: Job, engine: ChessEngine): void {
    job.engine = engine;
    this.active.add(job);

    const budget = STRENGTH_BUDGETS[job.strength];
    engine
      .analyze({
        fen: job.fen,
        depth: job.depth ?? budget.maxDepth,
        movetimeMs: job.movetimeMs ?? budget.timeMs,
        multiPv: job.multiPv ?? budget.multiPv,
        signal: job.signal,
      })
      .then((evaluation) => {
        this.completed += 1;
        job.resolve(evaluation);
      })
      .catch((error: unknown) => {
        // Visibility interrupts requeue instead of failing.
        if (job.engine === engine && !(error instanceof AnalysisAbortedError && this.suspended.has("hidden"))) {
          this.failed += 1;
          job.reject(error instanceof Error ? error : new Error(String(error)));
        }
      })
      .finally(() => {
        this.active.delete(job);
        job.engine = null;
        void this.pump();
      });
  }

  stats(): SchedulerStats {
    return {
      queueLength: this.queue.length,
      activeCount: this.active.size,
      poolSize: this.pool.length,
      paused: this.suspended.size > 0 || this.queue.some((j) => !this.canRun(j)),
      completed: this.completed,
      failed: this.failed,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.hiddenHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.hiddenHandler);
    }
    for (const job of [...this.active]) this.interrupt(job, false);
    for (const job of this.queue) job.reject(new AnalysisAbortedError("Scheduler disposed"));
    this.queue = [];
    for (const engine of this.pool) engine.dispose();
    this.pool = [];
  }
}
