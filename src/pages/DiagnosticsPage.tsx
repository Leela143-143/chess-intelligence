import { useEffect, useState } from "react";
import { useEngine } from "@/lib/engineContext";
import { ENGINE_BUILD } from "@/lib/engine/buildInfo";
import { detectDevice, classifyDevice, getModelState } from "@/lib/coach/gemma";
import { MODEL_PROFILES } from "@/lib/coach/types";
import { db } from "@/lib/db/schema";

/**
 * Hidden developer diagnostics (spec §100).
 * Reachable via the command palette ("Open diagnostics") or #/diagnostics.
 */
export default function DiagnosticsPage() {
  const engine = useEngine();
  const [device, setDevice] = useState<Awaited<ReturnType<typeof detectDevice>> | null>(null);
  const [dbSize, setDbSize] = useState<string>("unknown");
  const [cacheNames, setCacheNames] = useState<string[]>([]);
  const [gameCount, setGameCount] = useState(0);
  const [modelState] = useState(getModelState());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    detectDevice().then(setDevice).catch(() => setDevice(null));
    db.games.count().then(setGameCount).catch(() => undefined);
    if (navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((estimate) =>
          setDbSize(
            `${Math.round((estimate.usage ?? 0) / 1024)} KB used / ${Math.round((estimate.quota ?? 0) / (1024 * 1024))} MB quota`,
          ),
        )
        .catch(() => undefined);
    }
    if ("caches" in window) {
      window.caches
        .keys()
        .then((keys) => setCacheNames(keys))
        .catch(() => undefined);
    }
    const interval = window.setInterval(() => setTick((t) => t + 1), 2000);
    return () => window.clearInterval(interval);
  }, []);

  const stats = engine?.stats();

  return (
    <div className="stack">
      <h1>Diagnostics</h1>
      <p className="small faint">Hidden developer screen — tick {tick}</p>

      <div className="card">
        <h2>Stockfish</h2>
        <dl className="kv">
          <dt>build</dt>
          <dd>
            {ENGINE_BUILD.npmPackage}@{ENGINE_BUILD.packageVersion} ({ENGINE_BUILD.variant})
          </dd>
          <dt>worker</dt>
          <dd>{ENGINE_BUILD.workerPath}</dd>
          <dt>status</dt>
          <dd>{engine ? engine.statusMessage : "not initialized"}</dd>
          <dt>pool</dt>
          <dd>{stats ? `${stats.poolSize} workers, ${stats.activeCount} active, queue ${stats.queueLength}` : "—"}</dd>
          <dt>completed</dt>
          <dd>{stats ? `${stats.completed} jobs, ${stats.failed} failed, paused: ${stats.paused}` : "—"}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Local AI (Gemma)</h2>
        <dl className="kv">
          <dt>runtime</dt>
          <dd>not registered (Phase 4)</dd>
          <dt>model state</dt>
          <dd>{modelState.state}{modelState.state === "downloading" ? ` ${modelState.loadedMb}/${modelState.totalMb} MB` : ""}</dd>
          <dt>profiles</dt>
          <dd>{Object.keys(MODEL_PROFILES).length} available</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Device</h2>
        <dl className="kv">
          <dt>class</dt>
          <dd>{device ? classifyDevice(device) : "detecting…"}</dd>
          <dt>cores</dt>
          <dd>{device?.cores ?? "—"}</dd>
          <dt>memory</dt>
          <dd>{device?.memoryGb ? `${device.memoryGb} GB` : "unknown"}</dd>
          <dt>WebGPU</dt>
          <dd>{device ? String(device.webGpu) : "—"}</dd>
          <dt>WebAssembly</dt>
          <dd>{device ? String(device.webAssembly) : "—"}</dd>
          <dt>touch</dt>
          <dd>{device ? String(device.coarsePointer) : "—"}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Storage</h2>
        <dl className="kv">
          <dt>database</dt>
          <dd>{dbSize}</dd>
          <dt>games</dt>
          <dd>{gameCount}</dd>
          <dt>caches</dt>
          <dd>{cacheNames.length > 0 ? cacheNames.join(", ") : "none"}</dd>
        </dl>
      </div>
    </div>
  );
}
