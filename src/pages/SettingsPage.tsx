import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  db,
  getProfile,
  saveProfile,
  type ProfileRecord,
  type SettingsRecord,
} from "@/lib/db/schema";
import { useSettings } from "@/lib/settingsContext";
import {
  detectDevice,
  classifyDevice,
  localCoach,
  selectModelProfile,
  getModelState,
  onModelStateChange,
  type DeviceInfo,
} from "@/lib/coach/gemma";
import { MODEL_PROFILES } from "@/lib/coach/types";
import { ENGINE_BUILD } from "@/lib/engine/buildInfo";
import { downloadJson, exportAllDataAsJson, importBackupData } from "@/lib/db/backup";

/**
 * Settings (spec §56–58, §66, §75–77, §82).
 * Appearance, board/pieces, engine & AI, data export/import, privacy.
 */

const THEMES: Array<{ id: SettingsRecord["theme"]; label: string }> = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "oled", label: "OLED Dark" },
  { id: "contrast", label: "High Contrast" },
];

const BOARDS: Array<{ id: SettingsRecord["boardTheme"]; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "wood", label: "Wood" },
  { id: "marble", label: "Marble" },
  { id: "slate", label: "Slate" },
  { id: "minimal", label: "Minimal" },
];

const PIECES: Array<{ id: SettingsRecord["pieceSet"]; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "neo", label: "Neo" },
  { id: "minimal", label: "Minimal" },
];

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [modelState, setModelState] = useState(getModelState());
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProfile().then(setProfile).catch(() => undefined);
    detectDevice().then(setDevice).catch(() => setDevice(null));
  }, []);

  useEffect(() => onModelStateChange(setModelState), []);

  if (!profile) return <div className="skeleton" style={{ height: 300 }} />;

  return (
    <div className="stack">
      <h1>Settings</h1>

      <div className="card stack">
        <h2>Profile</h2>
        <div className="row">
          <input
            type="text"
            value={profile.displayName}
            onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
            placeholder="Display name"
            aria-label="Display name"
          />
          <input
            type="text"
            value={profile.avatar}
            onChange={(event) => setProfile({ ...profile, avatar: event.target.value.slice(0, 2) })}
            style={{ width: 64, textAlign: "center" }}
            aria-label="Avatar"
          />
        </div>
        <input
          type="text"
          value={profile.bio}
          onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
          placeholder="Bio (optional)"
          aria-label="Bio"
        />
        <div className="btn-row">
          <button className="btn small primary" onClick={() => void saveProfile(profile)}>
            Save profile
          </button>
        </div>
      </div>

      <div className="card stack">
        <h2>Appearance</h2>
        <div>
          <div className="small dim">Theme</div>
          <div className="seg" role="group" aria-label="Theme">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                className={settings.theme === theme.id ? "active" : ""}
                onClick={() => void update({ theme: theme.id })}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="small dim">Board</div>
          <div className="seg" role="group" aria-label="Board theme">
            {BOARDS.map((board) => (
              <button
                key={board.id}
                className={settings.boardTheme === board.id ? "active" : ""}
                onClick={() => void update({ boardTheme: board.id })}
              >
                {board.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="small dim">Pieces</div>
          <div className="seg" role="group" aria-label="Piece set">
            {PIECES.map((piece) => (
              <button
                key={piece.id}
                className={settings.pieceSet === piece.id ? "active" : ""}
                onClick={() => void update({ pieceSet: piece.id })}
              >
                {piece.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row between wrap">
          <div className="seg" role="group" aria-label="Orientation">
            <button
              className={settings.orientation === "white" ? "active" : ""}
              onClick={() => void update({ orientation: "white" })}
            >
              Play as White
            </button>
            <button
              className={settings.orientation === "black" ? "active" : ""}
              onClick={() => void update({ orientation: "black" })}
            >
              Play as Black
            </button>
          </div>
          <label className="row small dim" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(event) => void update({ reduceMotion: event.target.checked })}
              style={{ width: 16, minHeight: 16 }}
            />
            Reduce motion
          </label>
        </div>
      </div>

      <div className="card stack">
        <h2>Engine &amp; AI</h2>
        <dl className="kv">
          <dt>Engine</dt>
          <dd>
            {ENGINE_BUILD.npmPackage}@{ENGINE_BUILD.packageVersion} ({ENGINE_BUILD.variant})
          </dd>
          <dt>Device</dt>
          <dd>
            {device ? `${classifyDevice(device)} · ${device.cores} cores · ${device.webGpu ? "WebGPU" : "no WebGPU"}` : "detecting…"}
          </dd>
          <dt>Local AI Coach</dt>
          <dd>
            {localCoach.isAvailable()
              ? `available — ${selectModelProfile(device ?? { cores: 4, memoryGb: null, webGpu: false, webAssembly: true, coarsePointer: false }).label}`
              : "not installed in this build (deterministic coach active)"}
          </dd>
        </dl>

        <div>
          <div className="small dim">Analysis intensity</div>
          <div className="seg" role="group" aria-label="Analysis intensity">
            {(["fast", "standard", "deep"] as const).map((level) => (
              <button
                key={level}
                className={settings.analysisIntensity === level ? "active" : ""}
                onClick={() => void update({ analysisIntensity: level })}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <label className="row small dim" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={settings.backgroundAnalysis}
            onChange={(event) => void update({ backgroundAnalysis: event.target.checked })}
            style={{ width: 16, minHeight: 16 }}
          />
          Background analysis (pauses when the tab is hidden when off)
        </label>

        <div className="small faint">
          Model profiles: {Object.values(MODEL_PROFILES).map((p) => p.label).join(" · ")}
          {modelState.state === "downloading" && (
            <> — downloading {Math.round((modelState.loadedMb / modelState.totalMb) * 100)}%</>
          )}
        </div>
      </div>

      <div className="card stack">
        <h2>Data</h2>
        <p className="dim small">
          Your games stay on your device. Export a full backup (games, analyses, profile,
          settings, training, coach history) as JSON.
        </p>
        <div className="btn-row">
          <button
            className="btn small"
            onClick={() => {
              void exportAllDataAsJson().then((json) =>
                downloadJson(`chess-intelligence-backup-${Date.now()}.json`, json),
              );
            }}
          >
            Export all data
          </button>
          <button className="btn small ghost" onClick={() => importRef.current?.click()}>
            Import backup
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (!window.confirm("Erase ALL local data (games, analyses, profile, settings)? This cannot be undone.")) return;
              void db
                .transaction("rw", db.games, db.analyses, db.profile, db.settings, db.trainingItems, async () => {
                  await Promise.all([
                    db.games.clear(),
                    db.analyses.clear(),
                    db.profile.clear(),
                    db.settings.clear(),
                    db.trainingItems.clear(),
                  ]);
                })
                .then(() => db.coachMessages.clear())
                .then(() => {
                  void update(DEFAULT_SETTINGS);
                  setDataNotice("All local data erased.");
                });
            }}
          >
            Erase all data
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file
              .text()
              .then(importBackupData)
              .then((outcome) =>
                setDataNotice(
                  `Restored: ${outcome.gamesImported} games (${outcome.gamesSkipped} duplicates skipped), ${outcome.analysesImported} analyses, ${outcome.trainingImported} training items.`,
                ),
              )
              .catch((error: unknown) =>
                setDataNotice(`Import failed: ${error instanceof Error ? error.message : String(error)}`),
              );
          }}
        />
        {dataNotice && <div className="chip gold">{dataNotice}</div>}
      </div>

      <div className="card stack">
        <h2>About</h2>
        <p className="small dim">
          Chess Intelligence — <em>Understand your chess. Improve deliberately.</em>
        </p>
        <p className="small dim">
          Privacy: games, analysis, coach conversations, statistics and settings are stored in
          IndexedDB on this device only. No chess data is sent to any cloud AI. The coach runs
          locally (Gemma) or uses deterministic rule-based explanations — it never pretends.
        </p>
        <p className="small faint">
          Engine: Stockfish via GPL-3.0 npm build {ENGINE_BUILD.packageVersion}. Source:{" "}
          {ENGINE_BUILD.source}. Full license inventory: docs/licenses.md.
        </p>
      </div>
    </div>
  );
}
