import { useEffect, useMemo, useState } from "react";
import { matchRoute, navigate, useRoute } from "@/lib/router";
import { useSettings } from "@/lib/settingsContext";
import DashboardPage from "@/pages/DashboardPage";
import BoardPage from "@/pages/BoardPage";
import GamesPage from "@/pages/GamesPage";
import GamePage from "@/pages/GamePage";
import TrainingPage from "@/pages/TrainingPage";
import SettingsPage from "@/pages/SettingsPage";
import DiagnosticsPage from "@/pages/DiagnosticsPage";
import CommandPalette from "@/components/CommandPalette";

type NavItem = { path: string; label: string; icon: string };

const NAV: NavItem[] = [
  { path: "/", label: "Dashboard", icon: "◧" },
  { path: "/board", label: "Board", icon: "♞" },
  { path: "/games", label: "Games", icon: "▤" },
  { path: "/training", label: "Training", icon: "◎" },
  { path: "/settings", label: "Settings", icon: "⚙" },
];

export default function App(): React.ReactNode {
  const route = useRoute();
  const { settings } = useSettings();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const page = useMemo(() => {
    if (route === "/" || route === "") return <DashboardPage />;
    if (route === "/board") return <BoardPage />;
    if (route === "/games") return <GamesPage />;
    const game = matchRoute(route, "/game/:id");
    if (game) return <GamePage id={Number(game.id)} />;
    if (route === "/training") return <TrainingPage />;
    if (route === "/settings") return <SettingsPage />;
    if (route === "/diagnostics") return <DiagnosticsPage />;
    return (
      <div className="empty-state">
        <div className="glyph">◌</div>
        <h3>Page not found</h3>
        <button className="btn small" onClick={() => navigate("/")}>
          Back to dashboard
        </button>
      </div>
    );
  }, [route]);

  const commands = useMemo(
    () => [
      { id: "nav-board", label: "Open analysis board", run: () => navigate("/board") },
      { id: "nav-games", label: "Import PGN", run: () => navigate("/games") },
      { id: "nav-home", label: "Open dashboard", run: () => navigate("/") },
      { id: "nav-training", label: "Start training", run: () => navigate("/training") },
      { id: "nav-settings", label: "Open settings", run: () => navigate("/settings") },
      {
        id: "toggle-theme",
        label: "Toggle light / dark theme",
        run: () => {
          void settings.theme;
          const root = document.documentElement;
          const next = root.dataset.theme === "light" ? "dark" : "light";
          root.dataset.theme = next;
          setToast(`Theme: ${next}`);
        },
      },
      { id: "diagnostics", label: "Open diagnostics", run: () => navigate("/diagnostics") },
    ],
    [],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">♞</span> Chess Intelligence
        </div>
        {NAV.map((item) => (
          <a
            key={item.path}
            href={`#${item.path}`}
            className={
              item.path === "/"
                ? route === "/" || route === ""
                  ? "active"
                  : ""
                : route.startsWith(item.path)
                  ? "active"
                  : ""
            }
          >
            <span className="ico">{item.icon}</span> {item.label}
          </a>
        ))}
      </aside>

      <header className="topbar">
        <div className="brand">
          <span className="mark">♞</span>
          <span className="page-title">Chess Intelligence</span>
        </div>
        <div className="spacer" />
        <button
          className="btn ghost small"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search and commands"
          title="Commands (Ctrl/Cmd+K)"
        >
          ⌕ Search
        </button>
      </header>

      <main className="main">{page}</main>

      <nav className="bottomnav" aria-label="Primary">
        {NAV.map((item) => {
          const active =
            item.path === "/"
              ? route === "/" || route === ""
              : route.startsWith(item.path);
          return (
            <a key={item.path} href={`#${item.path}`} className={active ? "active" : ""}>
              <span className="ico">{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </nav>

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
