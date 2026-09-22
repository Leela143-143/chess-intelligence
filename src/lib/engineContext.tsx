import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EngineScheduler, type SchedulerStats, type SchedulerRequest } from "@/lib/engine/scheduler";
import { StockfishEngine } from "@/lib/engine/stockfish";
import { ENGINE_BUILD } from "@/lib/engine/buildInfo";
import type { EngineEvaluation } from "@/lib/engine/types";
import { classifyDevice, detectDevice, type DeviceClass, type DeviceInfo } from "@/lib/coach/gemma";
import { useSettings } from "./settingsContext";

/**
 * Engine runtime context: one EngineScheduler for the whole app.
 * Pool size + battery gate come from the detected device profile and the
 * user's settings (spec §16, §66, §90–92).
 */

export type EngineRuntime = {
  scheduler: EngineScheduler;
  analyze: (request: SchedulerRequest) => { promise: Promise<EngineEvaluation>; cancel: () => void };
  stats: () => SchedulerStats;
  device: DeviceInfo | null;
  deviceClass: DeviceClass | "unknown";
  engineName: string;
  status: "starting" | "ready" | "error";
  statusMessage: string;
};

const EngineContext = createContext<EngineRuntime | null>(null);

function poolSizeForClass(deviceClass: DeviceClass | "unknown", cores: number): number {
  switch (deviceClass) {
    case "ultra-low":
    case "low":
      return 1;
    case "balanced":
      return Math.min(2, Math.max(1, cores - 1));
    case "high":
    case "desktop":
      return Math.min(3, Math.max(2, cores - 2));
    default:
      return 1;
  }
}

export function EngineProvider({ children }: { children: ReactNode }): ReactNode {
  const { settings } = useSettings();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [status, setStatus] = useState<EngineRuntime["status"]>("starting");
  const [statusMessage, setStatusMessage] = useState("Starting engine…");

  const backgroundRef = useRef(settings.backgroundAnalysis);
  backgroundRef.current = settings.backgroundAnalysis;

  const schedulerRef = useRef<EngineScheduler | null>(null);
  const deviceClass: DeviceClass | "unknown" = device ? classifyDevice(device) : "unknown";

  // Detect device once.
  useEffect(() => {
    detectDevice()
      .then(setDevice)
      .catch(() => setDevice(null));
  }, []);

  // Create scheduler once device is known (pool size depends on it).
  useEffect(() => {
    if (!device || schedulerRef.current) return;
    const scheduler = new EngineScheduler({
      poolSize: poolSizeForClass(classifyDevice(device), device.cores),
      pauseWhenHidden: true,
      backgroundPermitted: () => backgroundRef.current,
      createEngine: () => new StockfishEngine(),
    });
    schedulerRef.current = scheduler;

    // Warm-up: verify the engine actually boots on this device (honest status).
    setStatus("starting");
    setStatusMessage("Starting Stockfish…");
    scheduler
      .submit({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        strength: "fast",
        priority: 1,
      })
      .promise.then(() => {
        setStatus("ready");
        setStatusMessage(`Ready — ${ENGINE_BUILD.npmPackage}@${ENGINE_BUILD.packageVersion}`);
      })
      .catch((error: unknown) => {
        setStatus("error");
        setStatusMessage(
          `Engine unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
    // Intentionally once device detection settles.
     
  }, [device]);

  // Suspend background analysis when the user turns it off.
  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;
    if (!settings.backgroundAnalysis) scheduler.suspend("user");
    else scheduler.resume("user");
  }, [settings.backgroundAnalysis]);

  const value = useMemo<EngineRuntime | null>(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return null;
    return {
      scheduler,
      analyze: (request) => scheduler.submit(request),
      stats: () => scheduler.stats(),
      device,
      deviceClass,
      engineName: `Stockfish 19 (${ENGINE_BUILD.variant})`,
      status,
      statusMessage,
    };
  }, [schedulerRef.current, device, deviceClass, status, statusMessage]);

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineRuntime | null {
  return useContext(EngineContext);
}
