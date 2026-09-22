/**
 * Local Gemma coach engine (spec §5, §7, §8, §18, §70).
 *
 * Lifecycle & profile system are fully implemented. The actual inference
 * runtime (WebLLM / Transformers.js — Phase 4) is plugged in behind
 * `GemmaRuntime` below. Until a runtime is registered on a device that can
 * run it, `isAvailable()` returns false and the app falls back to the
 * deterministic coach — NEVER to a cloud API, and never with fake
 * "AI says..." output.
 */

import type {
  CoachAvailability,
  CoachEngine,
  CoachRequest,
  CoachResponse,
  ModelProfile,
  ModelProfileId,
} from "./types";
import { MODEL_PROFILES } from "./types";
import { COACH_SYSTEM_PROMPT } from "./systemPrompt";
import { getPersonality } from "./personalities";

export type DeviceInfo = {
  cores: number;
  memoryGb: number | null;
  webGpu: boolean;
  webAssembly: boolean;
  coarsePointer: boolean;
};

export type DeviceClass = "ultra-low" | "low" | "balanced" | "high" | "desktop";

/** Detect device capabilities (spec §8, §90). */
export async function detectDevice(): Promise<DeviceInfo> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const coarse =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(pointer: coarse)").matches
      : false;

  let webGpu = false;
  if (nav && "gpu" in nav) {
    try {
      const gpu = (nav as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      webGpu = Boolean(gpu && (await gpu.requestAdapter()));
    } catch {
      webGpu = false;
    }
  }

  const memory = (nav as Navigator & { deviceMemory?: number } | undefined)?.deviceMemory;

  return {
    cores: nav?.hardwareConcurrency ?? 2,
    memoryGb: typeof memory === "number" ? memory : null,
    webGpu,
    webAssembly: typeof WebAssembly !== "undefined",
    coarsePointer: coarse,
  };
}

/** Map device capabilities to one of the five device profiles (spec §90). */
export function classifyDevice(device: DeviceInfo): DeviceClass {
  if (!device.coarsePointer && device.cores >= 8 && (device.memoryGb ?? 0) >= 8) {
    return "desktop";
  }
  if (!device.webAssembly) return "ultra-low";
  if (device.cores <= 2 || (device.memoryGb !== null && device.memoryGb <= 2)) {
    return "ultra-low";
  }
  if (device.coarsePointer && (device.memoryGb !== null && device.memoryGb <= 3 || device.cores <= 4)) {
    return "low";
  }
  if (device.webGpu && device.cores >= 8) return "high";
  return "balanced";
}

const PROFILE_BY_DEVICE: Record<DeviceClass, ModelProfileId> = {
  "ultra-low": "gemma-mobile-fast",
  low: "gemma-mobile-fast",
  balanced: "gemma-mobile",
  high: "gemma-browser-balanced",
  desktop: "gemma-browser-quality",
};

export function selectModelProfile(device: DeviceInfo): ModelProfile {
  return MODEL_PROFILES[PROFILE_BY_DEVICE[classifyDevice(device)]];
}

export type ModelDownloadState =
  | { state: "idle" }
  | { state: "downloading"; loadedMb: number; totalMb: number }
  | { state: "ready"; cachedBytes: number }
  | { state: "error"; message: string };

/**
 * Pluggable inference runtime (Phase 4: WebLLM or Transformers.js).
 * Registering a runtime is what makes the Gemma coach available.
 */
export interface GemmaRuntime {
  readonly id: string;
  load(
    profile: ModelProfile,
    onProgress: (loadedMb: number, totalMb: number) => void,
  ): Promise<void>;
  generate(
    profile: ModelProfile,
    systemPrompt: string,
    userPrompt: string,
    onToken: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string>;
  unload(): void;
  isLoaded(): boolean;
}

let registeredRuntime: GemmaRuntime | null = null;

/** Register the on-device inference runtime (called by Phase 4 bootstrap). */
export function registerGemmaRuntime(runtime: GemmaRuntime | null): void {
  registeredRuntime = runtime;
}

export function getRegisteredRuntime(): GemmaRuntime | null {
  return registeredRuntime;
}

const listeners = new Set<(state: ModelDownloadState) => void>();
let downloadState: ModelDownloadState = { state: "idle" };

function setDownloadState(state: ModelDownloadState): void {
  downloadState = state;
  for (const listener of listeners) listener(state);
}

export function onModelStateChange(listener: (state: ModelDownloadState) => void): () => void {
  listeners.add(listener);
  listener(downloadState);
  return () => listeners.delete(listener);
}

export function getModelState(): ModelDownloadState {
  return downloadState;
}

/**
 * LocalCoachEngine (spec §18): loads Gemma, manages lifecycle, streams output,
 * handles errors, monitors performance. The UI never talks to the runtime.
 */
export class LocalCoachEngine implements CoachEngine {
  readonly id = "gemma-local";
  readonly displayName = "Local Gemma Coach";

  private profile: ModelProfile | null = null;

  /** Probe device + runtime; the model itself is loaded lazily on demand. */
  async availability(): Promise<CoachAvailability> {
    if (!registeredRuntime) {
      return {
        available: false,
        reason: "Local AI runtime is not installed in this build yet (Phase 4).",
      };
    }
    if (typeof WebAssembly === "undefined") {
      return { available: false, reason: "WebAssembly is unavailable on this device." };
    }
    const device = await detectDevice();
    const profile = selectModelProfile(device);
    if (profile.requiresWebGpu && !device.webGpu) {
      return {
        available: false,
        reason: `Profile ${profile.label} requires WebGPU, which is unavailable.`,
      };
    }
    this.profile = profile;
    return { available: true, profile };
  }

  isAvailable(): boolean {
    return registeredRuntime !== null;
  }

  /** Download + cache the model (spec §7), reporting progress. */
  async ensureModel(onProgress?: (loadedMb: number, totalMb: number) => void): Promise<void> {
    const runtime = registeredRuntime;
    if (!runtime) throw new Error("Local AI runtime is not installed in this build.");
    if (runtime.isLoaded()) {
      setDownloadState({ state: "ready", cachedBytes: this.profile?.approxSizeMb ?? 0 });
      return;
    }
    const availability = await this.availability();
    if (!availability.available) throw new Error(availability.reason);
    try {
      setDownloadState({
        state: "downloading",
        loadedMb: 0,
        totalMb: availability.profile.approxSizeMb,
      });
      await runtime.load(availability.profile, (loaded, total) => {
        setDownloadState({ state: "downloading", loadedMb: loaded, totalMb: total });
        onProgress?.(loaded, total);
      });
      setDownloadState({ state: "ready", cachedBytes: availability.profile.approxSizeMb });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDownloadState({ state: "error", message });
      throw error;
    }
  }

  async generate(
    request: CoachRequest,
    onToken?: (chunk: string) => void,
  ): Promise<CoachResponse> {
    const started = performance.now();
    const runtime = registeredRuntime;
    if (!runtime || !this.profile) {
      throw new Error("Local AI Coach is unavailable on this device.");
    }
    await this.ensureModel();

    const systemPrompt = buildSystemWithPersonality(request);

    const raw = await runtime.generate(
      this.profile,
      systemPrompt,
      JSON.stringify(request.context),
      onToken ?? (() => {}),
    );

    return {
      text: raw,
      source: "gemma-local",
      evidence: [],
      confidence: "medium",
      generatedInMs: Math.round(performance.now() - started),
    };
  }

  unload(): void {
    registeredRuntime?.unload();
    setDownloadState({ state: "idle" });
  }
}

function buildSystemWithPersonality(request: CoachRequest): string {
  // Personality + system prompt assembly; validation of the output happens
  // downstream in validate.ts regardless of source.
  const personality = getPersonality(request.personalityId);
  return `${COACH_SYSTEM_PROMPT}\n\nPresentation style: ${personality.name}. ${personality.tone}`;
}

export const localCoach = new LocalCoachEngine();
