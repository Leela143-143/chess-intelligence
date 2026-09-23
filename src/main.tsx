import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SettingsProvider } from "@/lib/settingsContext";
import { EngineProvider } from "@/lib/engineContext";
import { PlayerProvider } from "@/lib/player/context";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <EngineProvider>
        <PlayerProvider>
          <App />
        </PlayerProvider>
      </EngineProvider>
    </SettingsProvider>
  </StrictMode>,
);

// PWA: register the service worker in production only.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support unavailable — app still works online */
    });
  });
}
