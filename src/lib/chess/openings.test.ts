import { describe, expect, it } from "vitest";
import { detectOpening, OPENING_INDEX } from "./openings";

describe("detectOpening", () => {
  it("detects the Ruy Lopez", () => {
    const match = detectOpening(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    expect(match).not.toBeNull();
    expect(match!.eco).toBe("C60");
    expect(match!.name).toBe("Ruy Lopez");
    expect(match!.plies).toBe(5);
  });

  it("prefers the longest matching line", () => {
    const match = detectOpening(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6"]);
    expect(match!.eco).toBe("C68"); // Exchange variation beats plain C60
    expect(match!.complete).toBe(true);
  });

  it("detects the Sicilian", () => {
    expect(detectOpening(["e4", "c5"])!.eco).toBe("B20");
  });

  it("detects the Queen's Gambit", () => {
    expect(detectOpening(["d4", "d5", "c4"])!.name).toBe("Queen's Gambit");
  });

  it("returns null for non-matching move orders", () => {
    expect(detectOpening(["a3", "h6"])).toBeNull();
  });

  it("requires at least two matching plies", () => {
    expect(detectOpening(["e4", "a6"])).toBeNull();
  });

  it("index entries have ECO codes and moves", () => {
    for (const entry of OPENING_INDEX) {
      expect(entry.eco).toMatch(/^[A-E]\d{2}$/);
      expect(entry.moves.length).toBeGreaterThan(0);
    }
  });
});
