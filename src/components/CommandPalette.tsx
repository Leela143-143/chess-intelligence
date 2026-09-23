import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CommandResult } from "@/lib/commands";

/**
 * CommandCenter (brief §39).
 *
 * Cmd/Ctrl + K (or `/`) opens a palette that searches *the player's chess*:
 * results, colours, openings, blunder plies, endgame errors and training. The
 * static commands are always available; the dynamic half comes from
 * `lib/commands.ts`, which parses the query into real database filters.
 */

export default function CommandCenter({
  commands,
  search,
  suggestions = [],
  onClose,
}: {
  commands: CommandResult[];
  search?: (query: string) => CommandResult[];
  suggestions?: string[];
  onClose: () => void;
}): ReactNode {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    const staticMatches = text
      ? commands.filter((command) => command.label.toLowerCase().includes(text))
      : commands;
    const dynamic = search && text.length >= 3 ? search(query) : [];
    const seen = new Set<string>();
    return [...dynamic, ...staticMatches].filter((command) => {
      if (seen.has(command.id)) return false;
      seen.add(command.id);
      return true;
    });
  }, [commands, query, search]);

  const run = (command: CommandResult | undefined) => {
    if (!command) return;
    command.run();
    onClose();
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search your chess"
      >
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          value={query}
          placeholder="Search your chess — results, openings, mistakes…"
          aria-label="Search your chess"
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(results[index]);
            }
          }}
        />

        {query.trim().length < 3 && suggestions.length > 0 && (
          <div className="palette-hint" aria-label="Suggested searches">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                className="btn small ghost"
                onClick={() => {
                  setQuery(suggestion);
                  setIndex(0);
                  inputRef.current?.focus();
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="items" role="listbox" aria-label="Commands">
          {results.length === 0 && (
            <div className="item" aria-disabled="true">
              <span className="label">Nothing matched that. Try a colour, a result or an opening.</span>
            </div>
          )}
          {results.map((command, position) => (
            <button
              key={command.id}
              role="option"
              aria-selected={position === index}
              className={`item ${position === index ? "active" : ""}`}
              onClick={() => run(command)}
              onMouseEnter={() => setIndex(position)}
            >
              <span className="kind">{command.kind}</span>
              <span className="label">{command.label}</span>
              {command.detail && <span className="kbd">{command.detail}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
