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
import { usePlayer } from "@/lib/player/context";
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
import { INTENSITY_SETTINGS } from "@/lib/chess/review";
import { downloadJson, exportAllDataAsJson, importBackupData } from "@/lib/db/backup";
import Piece from "@/components/Piece";

/**
 * Settings (brief §68 — appearance, engine, data, privacy).
 * Board and piece pickers preview the real renderer rather than a swatch.
 */

const THEMES: Array<{ id: SettingsRecord["theme"]; label: string }> = [
  { id: "dark", label: "Obsidian" },
  { id: "light", label: "Ivory" },
  { id: "oled", label: "OLED" },
  { id: "contrast", label: "Contrast" },
];

const BOARDS: Array<{ id: SettingsRecord["boardTheme"]; label: string }> = [
  { id: "obsidian", label: "Obsidian" },
  { id: "ivory", label: "Ivory" },
  { id: "slate", label: "Slate" },
  { id: "walnut", label: "Walnut" },
  { id: "paper", label: "Paper" },
  { id: "carbon", label: "Carbon" },
];

const PIECES: Array<{ id: SettingsRecord["pieceSet"]; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "tournament", label: "Tournament" },
  { id: "editorial", label: "Editorial" },
  { id: "minimal", label: "Minimal" },
  { id: "sculptural", label: "Sculptural" },
  { id: "technical", label: "Technical" },
];

function Switch({
  title,
  detail,
  checked,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span className="switch-copy">
        <span className="t">{title}</span>
        <span className="d">{detail}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const player = usePlayer();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [modelState, setModelState] = useState(getModelState());
  const [aliases, setAliases] = useState("");
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProfile()
      .then((loaded) => {
        setProfile(loaded);
        setAliases(settings.aliases.join(", "));
      })
      .catch(() => undefined);
    detectDevice().then(setDevice).catch(() => setDevice(null));
     
  }, []);

  useEffect(() => onModelStateChange(setModelState), []);

  if (!profile) return <div className="skeleton" style={{ height: 300 }} aria-label="Loading" />;

  const saveAliases = () => {
    const list = aliases
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    void update({ aliases: list });
    setDataNotice(
      list.length === 0
        ? "Aliases cleared — games can no longer be attributed to you automatically."
        : `Saved ${list.length} alias${list.length === 1 ? "" : "es"}. New imports will be tagged automatically.`,
    );
  };

  return (
    <div className="stack loose">
      <header className="page-head">
        <div className="page-head-titles">
          <p className="eyebrow">Configuration</p>
          <h1 className="display-m">Settings</h1>
        </div>
      </header>

      {/* ---------------------------------------------------------- identity */}
      <section className="panel stack">
        <div className="panel-head">
          <div>
            <div className="panel-eyebrow">Identity</div>
            <div className="panel-title">Who is playing</div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            type="text"
            value={profile.displayName}
            onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="aliases">PGN names you play under</label>
          <div className="row">
            <input
              id="aliases"
              type="text"
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
              placeholder="LeelaGunaVardhan, Leela143"
            />
            <button className="btn small" onClick={saveAliases}>
              Save
            </button>
          </div>
          <p className="panel-hint">
            Used to decide which side of an imported game is yours. Without it, stats stay
            colour-neutral instead of guessing.
          </p>
        </div>
        <div className="field">
          <label htmlFor="bio">Bio</label>
          <input
            id="bio"
            type="text"
            value={profile.bio}
            onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
            placeholder="Optional"
          />
        </div>
        <div className="btn-row">
          <button
            className="btn primary small"
            onClick={() => {
              void saveProfile(profile);
              setDataNotice("Profile saved.");
            }}
          >
            Save profile
          </button>
        </div>
      </section>

      {/* -------------------------------------------------------- appearance */}
      <section className="panel stack">
        <div className="panel-head">
          <div>
            <div className="panel-eyebrow">Appearance</div>
            <div className="panel-title">Studio</div>
          </div>
        </div>
        <div className="field">
          <label>Theme</label>
          <div className="seg">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                aria-pressed={settings.theme === theme.id}
                onClick={() => void update({ theme: theme.id })}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Board</label>
          <div className="board-picker">
            {BOARDS.map((board) => (
              <button
                key={board.id}
                className="board-swatch"
                data-board={board.id}
                aria-pressed={settings.boardTheme === board.id}
                onClick={() => void update({ boardTheme: board.id })}
              >
                <span className="sw">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                {board.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Piece set</label>
          <div className="piece-picker">
            {PIECES.map((set) => (
              <button
                key={set.id}
                className="piece-swatch"
                data-pieces={set.id}
                aria-pressed={settings.pieceSet === set.id}
                onClick={() => void update({ pieceSet: set.id })}
              >
                <span className="pcs">
                  <Piece type="n" color="w" />
                  <Piece type="k" color="b" />
                </span>
                {set.label}
              </button>
            ))}
          </div>
          <p className="panel-hint">
            All six sets are original vector geometry drawn for this project — no font glyphs,
            no scraped assets.
          </p>
        </div>

        <div className="field">
          <label>Default orientation</label>
          <div className="seg">
            <button
              aria-pressed={settings.orientation === "white"}
              onClick={() => void update({ orientation: "white" })}
            >
              Play as White
            </button>
            <button
              aria-pressed={settings.orientation === "black"}
              onClick={() => void update({ orientation: "black" })}
            >
              Play as Black
            </button>
          </div>
        </div>

        <div>
          <Switch
            title="Reduce motion"
            detail="Replaces movement with instant positional updates."
            checked={settings.reduceMotion}
            onChange={(next) => void update({ reduceMotion: next })}
          />
          <Switch
            title="Atmosphere"
            detail="The procedural grain, grid and glow behind the interface."
            checked={settings.atmosphere}
            onChange={(next) => void update({ atmosphere: next })}
          />
          <Switch
            title="Contextual cursor"
            detail="Desktop only: coordinate read-out over the board, inspect ring over data."
            checked={settings.customCursor}
            onChange={(next) => void update({ customCursor: next })}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------ engine */}
      <section className="panel stack">
        <div className="panel-head">
          <div>
            <div className="panel-eyebrow">Engine</div>
            <div className="panel-title">Analysis and local AI</div>
          </div>
        </div>
        <dl className="kv">
          <dt>Engine</dt>
          <dd>
            {ENGINE_BUILD.npmPackage}@{ENGINE_BUILD.packageVersion} ({ENGINE_BUILD.variant})
          </dd>
          <dt>Device class</dt>
          <dd>
            {device
              ? `${classifyDevice(device)} · ${device.cores} cores · ${device.webGpu ? "WebGPU" : "no WebGPU"}`
              : "detecting…"}
          </dd>
          <dt>Local coach</dt>
          <dd>
            {localCoach.isAvailable()
              ? `available — ${
                  selectModelProfile(
                    device ?? { cores: 4, memoryGb: null, webGpu: false, webAssembly: true, coarsePointer: false },
                  ).label
                }`
              : "deterministic rules active (Gemma runtime not installed)"}
          </dd>
        </dl>

        <div className="field">
          <label>Analysis intensity</label>
          <div className="seg">
            {(["fast", "standard", "deep"] as const).map((level) => (
              <button
                key={level}
                aria-pressed={settings.analysisIntensity === level}
                onClick={() => void update({ analysisIntensity: level })}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="panel-hint">
            {INTENSITY_SETTINGS[settings.analysisIntensity].shallow} sweep →{" "}
            {INTENSITY_SETTINGS[settings.analysisIntensity].deep} verification of the top{" "}
            {INTENSITY_SETTINGS[settings.analysisIntensity].moments} moments.
          </p>
        </div>

        <Switch
          title="Background analysis"
          detail="Pauses automatically when the tab is hidden or the battery is low."
          checked={settings.backgroundAnalysis}
          onChange={(next) => void update({ backgroundAnalysis: next })}
        />

        <p className="panel-hint">
          Model profiles available for a future local runtime:{" "}
          {Object.values(MODEL_PROFILES)
            .map((profile) => profile.label)
            .join(" · ")}
          {modelState.state === "downloading" && (
            <> — downloading {Math.round((modelState.loadedMb / modelState.totalMb) * 100)}%</>
          )}
        </p>
      </section>

      {/* -------------------------------------------------------------- data */}
      <section className="panel stack">
        <div className="panel-head">
          <div>
            <div className="panel-eyebrow">Data</div>
            <div className="panel-title">
              {player.total} game{player.total === 1 ? "" : "s"} · {player.analysed} analysed
            </div>
          </div>
        </div>
        <p className="prose small">
          Everything lives in IndexedDB on this device. Export a full backup (games, reviews,
          profile, settings, training, coach history) as JSON, or restore one.
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
              if (
                !window.confirm(
                  "Erase ALL local data (games, analyses, profile, settings, training)? This cannot be undone.",
                )
              )
                return;
              void db
                .transaction(
                  "rw",
                  db.games,
                  db.analyses,
                  db.profile,
                  db.settings,
                  db.trainingItems,
                  async () => {
                    await Promise.all([
                      db.games.clear(),
                      db.analyses.clear(),
                      db.profile.clear(),
                      db.settings.clear(),
                      db.trainingItems.clear(),
                    ]);
                  },
                )
                .then(() => db.coachMessages.clear())
                .then(() => {
                  void update(DEFAULT_SETTINGS);
                  void player.refresh();
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
              .then((outcome) => {
                void player.refresh();
                setDataNotice(
                  `Restored ${outcome.gamesImported} games (${outcome.gamesSkipped} duplicates skipped), ${outcome.analysesImported} reviews, ${outcome.trainingImported} training items.`,
                );
              })
              .catch((error: unknown) =>
                setDataNotice(
                  `Import failed: ${error instanceof Error ? error.message : String(error)}`,
                ),
              );
          }}
        />
        {dataNotice && <div className="chip jade" role="status">{dataNotice}</div>}
      </section>

      {/* ------------------------------------------------------------- about */}
      <section className="panel stack">
        <div className="panel-head">
          <div>
            <div className="panel-eyebrow">About</div>
            <div className="panel-title">Chess Intelligence</div>
          </div>
          <a className="btn small ghost" href="#/diagnostics">
            Diagnostics
          </a>
        </div>
        <p className="prose small">
          <em>Understand your chess. Improve deliberately.</em> Games, reviews, coach
          conversations, statistics and settings are stored on this device only. No chess data
          leaves the browser, and the coach labels every claim with its source.
        </p>
        <p className="small faint">
          Engine: Stockfish {ENGINE_BUILD.packageVersion} via the GPL-3.0 npm build. Full licence
          inventory, including the two self-hosted typefaces: docs/licenses.md.
        </p>
      </section>
    </div>
  );
}
