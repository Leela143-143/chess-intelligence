import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  type SettingsRecord,
} from "@/lib/db/schema";

type SettingsContextValue = {
  settings: SettingsRecord;
  ready: boolean;
  update: (patch: Partial<SettingsRecord>) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  ready: false,
  update: async () => {},
});

function applyToDocument(settings: SettingsRecord): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.reduceMotion = settings.reduceMotion ? "1" : "0";
  document.body.dataset.board = settings.boardTheme;
  document.body.dataset.pieces = settings.pieceSet;
}

export function SettingsProvider({ children }: { children: ReactNode }): ReactNode {
  const [settings, setSettings] = useState<SettingsRecord>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        applyToDocument(loaded);
        setReady(true);
      })
      .catch(() => {
        applyToDocument(DEFAULT_SETTINGS);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: Partial<SettingsRecord>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      applyToDocument(next);
      return next;
    });
    try {
      await saveSettings(patch);
    } catch {
      /* settings still apply for this session even if persistence fails */
    }
  }, []);

  const value = useMemo(
    () => ({ settings, ready, update }),
    [settings, ready, update],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
