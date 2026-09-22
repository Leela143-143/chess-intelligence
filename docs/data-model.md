# Local-First Data Model

IndexedDB via **Dexie.js** (`src/lib/db/schema.ts`), database name
`chess-intelligence`. No server, no account, no PostgreSQL — the core app is
self-contained (spec §10–11, §74–77).

## Tables (v1)

### `games` — local game database
| field | type | notes |
|---|---|---|
| id | autoincrement | |
| fingerprint | string, **unique** | dedupe key (see below) |
| source | string | `pgn-import`, future providers |
| importedAt | number | epoch ms; list order |
| headers | PgnHeaders | event/site/date/round/white/black/result/timeControl/Elos/termination/ECO/FEN (all sanitized ≤300 chars) |
| sanList | string[] | move list for display |
| uciList | string[] | canonical move list (replay, fingerprint) |
| result | string | `1-0 \| 0-1 \| 1/2-1/2 \| *` |
| pgn | string | original text (bounded) |
| openingEco / openingName | string? | detected on import |
| analyzedAt | number? | set when full analysis exists |

Indexes: `&fingerprint, importedAt, result, openingEco, analyzedAt`.

### `analyses`
Per-game analysis results: `gameId` (unique), engine build, strength,
white/black accuracy + ACPL, per-ply `cpLosses[]`, `classifications[]`,
`criticalMoments[]`, opening, summary. Deletion of a game cascades (transaction).

### `profile` (single row `current`)
displayName, avatar, bio, createdAt, optional ratings.

### `settings` (single row `current`)
theme (`dark|light|oled|contrast`), boardTheme (`classic|wood|marble|slate|minimal`),
pieceSet (`classic|neo|minimal`), orientation, deviceProfile (auto or override),
analysisIntensity, backgroundAnalysis, personalityId, targetLevel, reduceMotion.
Merged over `DEFAULT_SETTINGS` on read.

### `trainingItems` (Phase 7)
Position puzzles with SM-2-lite spaced repetition: `fen` (unique), `solutionUci[]`,
`solutionSan[]`, `theme`, `difficulty`, `source`/`sourceGameId`, `attempts`,
`successes`, `interval`, `ease`, `due`, `lastResult`, `lastSeen`.
Indexes include `due` for the scheduler and `theme` for grouping.

### `coachMessages`
Conversation log: `conversationId`, `role`, `text`, `source`, `evidence[]`,
`createdAt`. Local only (privacy: coach conversations never leave the device).

## Deduplication (spec §29)

`gameFingerprint()` = FNV-1a (two salts, 64-bit-ish hex) over a normalized key:

```
v1 | providerId | lower(trim(white)) | lower(trim(black)) | date | result |
timeControl | uci1,uci2,...
```

Provider ID participates when present (future Lichess/Chess.com imports), so the
same game from different sources still collides when moves match.

## Backup package (spec §76–77)

```json
{
  "app": "chess-intelligence",
  "schemaVersion": 1,
  "exportedAt": "ISO-8601",
  "games": [...], "analyses": [...], "profile": {...}, "settings": {...},
  "trainingItems": [...], "coachMessages": [...]
}
```

- Export: `exportAllDataAsJson()` → browser download.
- Import: `importBackupData()` — 50 MB cap, `app` check, prototype-pollution-safe key
  scan, per-record shape validation, games merged by fingerprint, analyses only
  attached to existing games (never orphaned), profile/settings replaced.
- Future optional sync service (out of scope now, spec §11) would reuse this exact
  package format as its transport.
