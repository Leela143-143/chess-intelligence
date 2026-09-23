import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { matchRoute, navigate, splitRoute, useRoute } from "@/lib/router";
import { useSettings } from "@/lib/settingsContext";
import { usePlayer } from "@/lib/player/context";
import { dismissToast, pushToast, useToasts } from "@/lib/toast";
import { buildGameCommands, SUGGESTED_QUERIES, type CommandResult } from "@/lib/commands";
import { toPlayerGames } from "@/lib/player/analytics";
import HomePage from "@/pages/HomePage";
import BoardPage from "@/pages/BoardPage";
import GamesPage from "@/pages/GamesPage";
import GamePage from "@/pages/GamePage";
import ProfilePage from "@/pages/ProfilePage";
import TrainingPage from "@/pages/TrainingPage";
import SettingsPage from "@/pages/SettingsPage";
import DiagnosticsPage from "@/pages/DiagnosticsPage";
import CommandCenter from "@/components/CommandPalette";
import { AtmosphereFX, CursorLayer } from "@/components/ambient";
import { useEngine } from "@/lib/engineContext";

/**
 * AppShell (brief §38, §40, §41) — minimal top rail on desktop, bottom bar on
 * mobile, one nav model, shared page transitions, a polite route announcer and
 * the ambient layer. The five primary destinations are Home, Games, Analyse,
 * Train and Profile; settings and diagnostics live behind the rail.
 */

type NavItem = { path: string; label: string; icon: ReactNode };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const NAV: NavItem[] = [
  {
    path: "/",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...stroke} d="M4 11 12 4l8 7v9H4z" />
        <path {...stroke} d="M9 20v-6h6v6" />
      </svg>
    ),
  },
  {
    path: "/games",
    label: "Games",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...stroke} d="M4 5h16M4 12h16M4 19h10" />
      </svg>
    ),
  },
  {
    path: "/board",
    label: "Analyse",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...stroke} x="4" y="4" width="16" height="16" rx="2" />
        <path {...stroke} d="M4 12h16M12 4v16" />
      </svg>
    ),
  },
  {
    path: "/training",
    label: "Train",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...stroke} cx="12" cy="12" r="8" />
        <path {...stroke} d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    path: "/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...stroke} cx="12" cy="9" r="3.4" />
        <path {...stroke} d="M5 20c1.4-3.6 4-5.4 7-5.4S17.6 16.4 19 20" />
      </svg>
    ),
  },
];

const TITLES: Record<string, string> = {
  "/": "Home",
  "/games": "Games",
  "/board": "Analyse",
  "/training": "Train",
  "/profile": "Profile",
  "/settings": "Settings",
  "/diagnostics": "Diagnostics",
};

export default function App(): ReactNode {
  const route = useRoute();
  const { path, params } = useMemo(() => splitRoute(route), [route]);
  const { settings } = useSettings();
  const engine = useEngine();
  const player = usePlayer();
  const toasts = useToasts();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const announced = useRef<string>("");

  /* --------------------------------------------------------------- hotkeys */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------------- route announcement + scroll reset */
  useEffect(() => {
    const title = TITLES[path] ?? (matchRoute(path, "/game/:id") ? "Game review" : "Chess Intelligence");
    document.title = `${title} · Chess Intelligence`;
    if (announced.current !== path) {
      announced.current = path;
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [path]);

  /* ------------------------------------------------ completion microcopy */
  useEffect(() => {
    if (!player.ready) return;
    if (player.analysed > 0 && player.analysed % 5 === 0) {
      pushToast(
        `${player.analysed} games analysed`,
        "success",
        "Open your profile to see how the DNA radar has moved.",
      );
    }
    // Only announce when the analysed count crosses a multiple of five.
     
  }, [player.analysed]);

  const page = useMemo(() => {
    if (path === "/" || path === "") return <HomePage />;
    if (path === "/board") return <BoardPage params={params} />;
    if (path === "/games") return <GamesPage params={params} />;
    const game = matchRoute(path, "/game/:id");
    if (game) return <GamePage id={Number(game.id)} />;
    if (path === "/profile") return <ProfilePage />;
    if (path === "/training") return <TrainingPage />;
    if (path === "/settings") return <SettingsPage />;
    if (path === "/diagnostics") return <DiagnosticsPage />;
    return (
      <div className="empty-state">
        <div className="glyph">◌</div>
        <h3>That page doesn't exist</h3>
        <p className="dim">The link may be out of date.</p>
        <button className="btn primary" onClick={() => navigate("/")}>
          Back to home
        </button>
      </div>
    );
  }, [path, params]);

  /* ------------------------------------------------------------ commands */
  const staticCommands: CommandResult[] = useMemo(
    () => [
      { id: "go-home", label: "Go to Home", kind: "navigate", run: () => navigate("/") },
      { id: "go-games", label: "Go to Games", kind: "navigate", run: () => navigate("/games") },
      { id: "go-board", label: "Open the analysis board", kind: "navigate", run: () => navigate("/board") },
      { id: "go-train", label: "Go to Training", kind: "navigate", run: () => navigate("/training") },
      { id: "go-profile", label: "Go to Profile", kind: "navigate", run: () => navigate("/profile") },
      {
        id: "cycle-theme",
        label: "Cycle interface theme",
        kind: "action",
        detail: settings.theme,
        run: () => {
          const order = ["dark", "light", "oled", "contrast"] as const;
          const next = order[(order.indexOf(settings.theme as never) + 1) % order.length]!;
          void import("@/lib/db/schema").then((module) =>
            module.saveSettings({ theme: next }).then(() => {
              document.documentElement.dataset.theme = next;
            }),
          );
          pushToast(`Theme: ${next}`);
        },
      },
      {
        id: "go-settings",
        label: "Open settings",
        kind: "navigate",
        run: () => navigate("/settings"),
      },
      {
        id: "go-diagnostics",
        label: "Open diagnostics",
        kind: "navigate",
        run: () => navigate("/diagnostics"),
      },
    ],
    [settings.theme],
  );

  const searchCommands = useMemo(() => {
    const games = toPlayerGames(player.pairs);
    return (query: string): CommandResult[] =>
      buildGameCommands(query, games, (hash) => navigate(hash.replace(/^#/, "")));
  }, [player.pairs]);

  const activePath = (item: NavItem): boolean =>
    item.path === "/" ? path === "/" || path === "" : path.startsWith(item.path);

  return (
    <div className="app-shell">
      <AtmosphereFX />
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="rail">
        <a className="rail-brand" href="#/" aria-label="Chess Intelligence home">
          <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path
              {...stroke}
              d="M8 20h8M9.5 20c0-3 .5-5 1.5-6.5C9 12 7.5 10 7.5 7.5 7.5 5 9.5 3 12 3s4.5 2 4.5 4.5c0 1.4-.8 3-2 4.2 1.2 1.7 1.5 4.3 1.5 8.3"
            />
          </svg>
          <span className="wordmark">Chess Intelligence</span>
        </a>

        <nav className="rail-nav" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              aria-current={activePath(item) ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="rail-ctx">
          <span
            className="rail-engine"
            data-state={engine?.status ?? "starting"}
            title={engine?.statusMessage ?? "Engine starting"}
          >
            <i className="led" />
            {engine?.status === "ready" ? "Stockfish 19" : engine?.status === "error" ? "engine error" : "engine…"}
          </span>
          <button
            className="btn small ghost"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search your chess (Ctrl or Cmd + K)"
          >
            ⌕ Search
          </button>
          <a
            className="btn small ghost"
            href="#/settings"
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </a>
        </div>
      </header>

      <main className="app-page" id="main" ref={mainRef}>
        <div key={path} className="page-enter">
          {page}
        </div>
      </main>

      <nav className="bottomnav" aria-label="Primary">
        {NAV.map((item) => (
          <a
            key={item.path}
            href={`#${item.path}`}
            className="nav-item"
            aria-current={activePath(item) ? "page" : undefined}
          >
            {item.icon}
            {item.label}
          </a>
        ))}
      </nav>

      <div className="sr-only" role="status" aria-live="polite">
        {TITLES[path] ? `${TITLES[path]} page` : "Page loaded"}
      </div>

      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <span>
              <strong>{toast.message}</strong>
              {toast.detail && <div className="small faint">{toast.detail}</div>}
            </span>
            <button
              className="btn icon small ghost"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {paletteOpen && (
        <CommandCenter
          commands={staticCommands}
          search={searchCommands}
          suggestions={SUGGESTED_QUERIES}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      <CursorLayer />
    </div>
  );
}
