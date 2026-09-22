import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "@/lib/router";
import { importPgn, MAX_PGN_BYTES, MAX_GAMES_PER_IMPORT } from "@/lib/chess/pgn";
import { gameFingerprint } from "@/lib/chess/fingerprint";
import { importGames, listGames, type GameRecord } from "@/lib/db/schema";
import { detectOpening } from "@/lib/chess/openings";
import { EmptyState, GameCard, type GameCardData } from "@/components/cards";

/**
 * Game import (spec §26–29): PGN file, pasted PGN, drag-and-drop, bulk files.
 * Deduplicates via fingerprints. Never asks for a third-party password.
 */

type ImportReport = {
  added: number;
  duplicates: number;
  errors: number;
  truncated: boolean;
  message: string;
};

function gameToCard(game: GameRecord, myName: string | null): GameCardData {
  const opening = detectOpening(game.sanList);
  const myColor =
    myName && game.headers.white?.toLowerCase() === myName.toLowerCase()
      ? "w"
      : myName && game.headers.black?.toLowerCase() === myName.toLowerCase()
        ? "b"
        : undefined;
  return {
    id: game.id!,
    white: game.headers.white ?? "White",
    black: game.headers.black ?? "Black",
    result: game.result,
    date: game.headers.date,
    opening: opening
      ? `${opening.eco} ${opening.name}${opening.variation ? ` (${opening.variation})` : ""}`
      : undefined,
    analyzed: Boolean(game.analyzedAt),
    myColor,
  };
}

export default function GamesPage() {
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pgnText, setPgnText] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listGames()
      .then(setGames)
      .catch(() => setGames([]));
  };

  useEffect(refresh, []);

  const ingest = async (texts: string[]) => {
    let added = 0;
    let duplicates = 0;
    let errors = 0;
    let truncated = false;

    for (const text of texts) {
      if (text.length > MAX_PGN_BYTES) {
        errors++;
        continue;
      }
      const result = importPgn(text);
      errors += result.errors.length;
      truncated = truncated || result.truncated;
      const payload = result.games.map((game) => ({
        fingerprint: gameFingerprint({
          headers: game.headers,
          uciList: game.uciList,
        }),
        source: "pgn-import",
        headers: game.headers,
        sanList: game.sanList,
        uciList: game.uciList,
        result: game.result,
        pgn: game.pgn,
        openingEco: detectOpening(game.sanList)?.eco,
        openingName: detectOpening(game.sanList)?.name,
      }));
      const outcome = await importGames(payload);
      added += outcome.added.length;
      duplicates += outcome.duplicates;
    }

    setReport({
      added,
      duplicates,
      errors,
      truncated,
      message:
        added === 0 && duplicates === 0 && errors === 0
          ? "No games found in the provided text."
          : `Imported ${added} game${added === 1 ? "" : "s"}` +
            (duplicates ? `, ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : "") +
            (errors ? `, ${errors} parse error${errors === 1 ? "" : "s"}` : "") +
            (truncated ? ` (limited to ${MAX_GAMES_PER_IMPORT} games)` : ""),
    });
    refresh();
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, MAX_GAMES_PER_IMPORT);
    const texts = await Promise.all(
      list.map((file) =>
        file.size > MAX_PGN_BYTES
          ? Promise.resolve("")
          : (file.text() as Promise<string>),
      ),
    );
    await ingest(texts.filter((t) => t.trim().length > 0));
  };

  const openGame = (id: number) => navigate(`/game/${id}`);

  const cards = useMemo(
    () => (games ?? []).map((game) => gameToCard(game, null)),
    [games],
  );

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Your games</h1>
        <div className="btn-row">
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            + PGN file{cards.length > 0 ? "" : "s"}
          </button>
          <button className="btn small ghost" onClick={() => setPasteOpen((o) => !o)}>
            Paste PGN
          </button>
        </div>
      </div>

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
          if (event.dataTransfer.files.length > 0) {
            void handleFiles(event.dataTransfer.files);
          }
        }}
      >
        Drag &amp; drop PGN files here — or use the buttons above.
        <div className="faint small" style={{ marginTop: 6 }}>
          Files never leave your device. Duplicates are detected automatically.
        </div>
      </div>

      {pasteOpen && (
        <div className="card stack">
          <h3>Paste PGN</h3>
          <textarea
            value={pgnText}
            onChange={(event) => setPgnText(event.target.value)}
            placeholder={'[Event "Casual"]\n[White "Me"]\n[Black "Opponent"]\n1. e4 e5 2. Nf3 *'}
            aria-label="PGN text"
          />
          <div className="btn-row">
            <button
              className="btn small primary"
              disabled={!pgnText.trim()}
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

      {report && (
        <div className="card row between wrap">
          <span className="small">{report.message}</span>
          <button className="btn small ghost" onClick={() => setReport(null)}>
            dismiss
          </button>
        </div>
      )}

      {games === null ? (
        <div className="skeleton" style={{ height: 160 }} aria-label="Loading games" />
      ) : games.length === 0 ? (
        <EmptyState glyph="▤" title="No games yet">
          <p>Import your first PGN — file, paste or drag-and-drop.</p>
        </EmptyState>
      ) : (
        <div className="stack">
          <div className="small faint">
            {games.length} game{games.length === 1 ? "" : "s"} in your local database
          </div>
          {cards.map((card) => (
            <GameCard key={card.id} game={card} onOpen={openGame} />
          ))}
        </div>
      )}
    </div>
  );
}
