import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { navigate } from "@/lib/router";
import { importPgn, MAX_PGN_BYTES, MAX_GAMES_PER_IMPORT } from "@/lib/chess/pgn";
import { gameFingerprint } from "@/lib/chess/fingerprint";
import {
  detectPlayerColor,
  importGames,
  type GameRecord,
} from "@/lib/db/schema";
import { useSettings } from "@/lib/settingsContext";
import { usePlayer } from "@/lib/player/context";
import { outcomeOf } from "@/lib/player/stats";
import { applyFilters, filtersFromToken, type GameFilter } from "@/lib/commands";
import { toPlayerGames } from "@/lib/player/analytics";
import { detectOpening } from "@/lib/chess/openings";
import { pushToast } from "@/lib/toast";

/**
 * Games library (brief §26–§29, §43).
 * Import by file, paste or drag-and-drop with dedupe, then filter the library
 * with the same query language the command centre speaks (§39).
 */

type SortKey = "recent" | "worst" | "best";

export default function GamesPage({ params }: { params?: URLSearchParams }): ReactNode {
  const { settings } = useSettings();
  const player = usePlayer();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pgnText, setPgnText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");

  const activeFilters: GameFilter[] = useMemo(
    () => filtersFromToken(params?.get("f") ?? null),
    [params],
  );

  const playerGames = useMemo(() => toPlayerGames(player.pairs), [player.pairs]);

  const filtered = useMemo(() => {
    const games = applyFilters(playerGames, activeFilters);
    const copy = [...games];
    if (sort === "worst") copy.sort((a, b) => (a.accuracy ?? 999) - (b.accuracy ?? 999));
    if (sort === "best") copy.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
    return copy;
  }, [playerGames, activeFilters, sort]);

  const byId = useMemo(
    () => new Map(player.pairs.map((pair) => [pair.game.id!, pair])),
    [player.pairs],
  );

  const visibleRecords: GameRecord[] = useMemo(() => {
    const ids = new Set(filtered.map((game) => game.gameId));
    return player.games.filter((game) => ids.has(game.id!));
  }, [filtered, player.games]);

  const ingest = async (texts: string[]) => {
    setBusy(true);
    let added = 0;
    let duplicates = 0;
    let errors = 0;

    for (const text of texts) {
      if (text.length > MAX_PGN_BYTES) {
        errors += 1;
        continue;
      }
      const result = importPgn(text);
      errors += result.errors.length;
      const payload = result.games.map((game) => {
        const opening = detectOpening(game.sanList);
        const colour = detectPlayerColor(game.headers, settings.aliases);
        return {
          fingerprint: gameFingerprint({ headers: game.headers, uciList: game.uciList }),
          source: "pgn-import",
          headers: game.headers,
          sanList: game.sanList,
          uciList: game.uciList,
          result: game.result,
          pgn: game.pgn,
          ...(opening ? { openingEco: opening.eco, openingName: opening.name } : {}),
          playerColor: colour,
        };
      });
      const outcome = await importGames(payload);
      added += outcome.added.length;
      duplicates += outcome.duplicates;
    }

    await player.refresh();
    setBusy(false);
    pushToast(
      added > 0 ? `Imported ${added} game${added === 1 ? "" : "s"}` : "Nothing new to import",
      added > 0 ? "success" : "info",
      [
        duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : "",
        errors ? `${errors} parse error${errors === 1 ? "" : "s"}` : "",
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    );
    if (added > 0 && settings.aliases.length === 0) {
      pushToast(
        "Name your games so stats know which side is yours",
        "warn",
        "Add your PGN player names in Settings.",
      );
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, MAX_GAMES_PER_IMPORT);
    const texts = await Promise.all(
      list.map((file) =>
        file.size > MAX_PGN_BYTES ? Promise.resolve("") : (file.text() as Promise<string>),
      ),
    );
    await ingest(texts.filter((text) => text.trim().length > 0));
  };

  useEffect(() => {
    if (!dragOver) return;
    const clear = () => setDragOver(false);
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, [dragOver]);

  return (
    <div className="stack">
      <header className="page-head">
        <div className="page-head-titles">
          <p className="eyebrow">Library</p>
          <h1 className="display-m">
            {player.total} game{player.total === 1 ? "" : "s"}
          </h1>
          <p className="small faint">
            {player.analysed} reviewed · {player.total - player.analysed} waiting
          </p>
        </div>
        <div className="page-actions">
          <button className="btn primary small" onClick={() => fileRef.current?.click()}>
            Import PGN
          </button>
          <button className="btn small ghost" onClick={() => setPasteOpen((open) => !open)}>
            Paste
          </button>
          <a className="btn small ghost" href="#/settings">
            Names
          </a>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept=".pgn,.txt,application/x-chess-pgn,text/plain"
        multiple
        style={{ display: "none" }}
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div
        className={`dropzone ${dragOver ? "over" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (event.dataTransfer.files.length > 0) void handleFiles(event.dataTransfer.files);
          else {
            const text = event.dataTransfer.getData("text");
            if (text) void ingest([text]);
          }
        }}
      >
        <strong>{busy ? "Importing…" : "Drop PGN files here"}</strong>
        <span className="small faint">
          or paste text · duplicates are detected automatically · files never leave this device
        </span>
      </div>

      {pasteOpen && (
        <div className="panel stack">
          <div className="panel-head">
            <div>
              <div className="panel-eyebrow">Paste</div>
              <div className="panel-title">PGN text</div>
            </div>
          </div>
          <textarea
            value={pgnText}
            onChange={(event) => setPgnText(event.target.value)}
            placeholder={'[Event "Casual"]\n[White "Me"]\n[Black "Opponent"]\n1. e4 e5 2. Nf3 *'}
            aria-label="PGN text"
          />
          <div className="btn-row">
            <button
              className="btn primary small"
              disabled={!pgnText.trim() || busy}
              onClick={() => {
                const text = pgnText;
                setPgnText("");
                setPasteOpen(false);
                void ingest([text]);
              }}
            >
              Import
            </button>
            <button className="btn small ghost" onClick={() => setPasteOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {player.total > 0 && (
        <div className="row between wrap">
          <div className="row wrap" style={{ gap: "var(--s-2)" }}>
            {activeFilters.length > 0 ? (
              <>
                {activeFilters.map((filter) => (
                  <span className="chip jade" key={filter.token}>
                    {filter.label}
                  </span>
                ))}
                <a className="btn small ghost" href="#/games">
                  Clear
                </a>
              </>
            ) : (
              <span className="small faint">Showing everything</span>
            )}
          </div>
          <div className="seg" role="group" aria-label="Sort games">
            {(["recent", "worst", "best"] as SortKey[]).map((option) => (
              <button key={option} aria-pressed={sort === option} onClick={() => setSort(option)}>
                {option === "recent" ? "Recent" : option === "worst" ? "Worst" : "Best"}
              </button>
            ))}
          </div>
        </div>
      )}

      {player.total === 0 ? (
        <div className="empty-state">
          <h3>No games yet</h3>
          <p className="dim">
            Import your first PGN — a file, a paste or a drag-and-drop — and this becomes a
            private laboratory for your own play.
          </p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              Choose a PGN file
            </button>
            <button className="btn ghost" onClick={() => navigate("/board")}>
              Look at the board first
            </button>
          </div>
        </div>
      ) : visibleRecords.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing matches that filter</h3>
          <p className="dim">Try a broader query, or clear the filter.</p>
          <a className="btn" href="#/games">
            Clear filter
          </a>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visibleRecords.map((record) => {
            const pair = byId.get(record.id!);
            const analysis = pair?.analysis;
            const colour = record.playerColor ?? null;
            const outcome = outcomeOf(record.result, colour);
            const accuracy =
              colour === "w" ? analysis?.whiteAccuracy : colour === "b" ? analysis?.blackAccuracy : null;
            const ideas = analysis?.moments?.length ?? 0;
            const topPattern = analysis?.moments?.[0];

            return (
              <li key={record.id}>
                <button className="game-card" onClick={() => navigate(`/game/${record.id}`)}>
                  <span className={`result ${outcome === "unknown" ? "draw" : outcome}`}>
                    {record.result === "*" ? "…" : outcome === "win" ? "W" : outcome === "loss" ? "L" : outcome === "draw" ? "D" : "?"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 620, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {record.headers.white ?? "White"} — {record.headers.black ?? "Black"}
                    </span>
                    <span className="small faint">
                      {record.headers.date ?? "date unknown"}
                      {record.openingName ? ` · ${record.openingName}` : ""}
                      {record.headers.timeControl ? ` · ${record.headers.timeControl}` : ""}
                    </span>
                    {topPattern && (
                      <span className="small dim" style={{ display: "block" }}>
                        key moment at move {Math.ceil(topPattern.ply / 2)}: {topPattern.san}
                      </span>
                    )}
                  </span>
                  <span className="row" style={{ gap: "var(--s-2)", flex: "none" }}>
                    {accuracy !== undefined && accuracy !== null && (
                      <span className="chip">{accuracy.toFixed(0)}% acc</span>
                    )}
                    {ideas > 0 && <span className="chip gold">{ideas} moments</span>}
                    {!analysis && <span className="chip">not reviewed</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {player.total > 0 && player.analysed < player.total && (
        <div className="panel row between wrap">
          <div>
            <div className="panel-title">
              {player.total - player.analysed} game
              {player.total - player.analysed === 1 ? "" : "s"} still unreviewed
            </div>
            <p className="small faint" style={{ margin: 0 }}>
              Open any game and press Review — the two-stage analysis runs locally.
            </p>
          </div>
          <button
            className="btn primary small"
            onClick={() => {
              const next = player.games.find((game) => !game.analyzedAt);
              if (next) navigate(`/game/${next.id}`);
            }}
          >
            Review the next one
          </button>
        </div>
      )}
    </div>
  );
}
