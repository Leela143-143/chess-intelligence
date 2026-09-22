import "fake-indexeddb/auto";

// jsdom lacks a few browser APIs used by the app.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  if (!("hardwareConcurrency" in navigator) || !navigator.hardwareConcurrency) {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 4, configurable: true });
  }
}
