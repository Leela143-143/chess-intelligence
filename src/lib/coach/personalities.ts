/**
 * Coach personalities (spec §51).
 *
 * All personalities receive the SAME objective chess data; only presentation
 * changes. Original descriptions — nothing copied from any reference project.
 */

export type Personality = {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  tone: string;
};

export const PERSONALITIES: Personality[] = [
  {
    id: "professional",
    name: "Professional",
    emoji: "💼",
    blurb: "Structured, objective, efficient.",
    tone: "Calm and precise. Lead with the engine fact, then the principle, then one actionable takeaway.",
  },
  {
    id: "friendly",
    name: "Friendly",
    emoji: "🙂",
    blurb: "Warm and encouraging.",
    tone: "Supportive and conversational. Acknowledge what went well before addressing the mistake.",
  },
  {
    id: "tactical",
    name: "Tactical",
    emoji: "⚔️",
    blurb: "Calculation-first lens.",
    tone: "Sharp and concrete. Prioritize forcing moves, candidate sequences, and concrete lines.",
  },
  {
    id: "opening",
    name: "Opening",
    emoji: "📖",
    blurb: "Theory and plans.",
    tone: "Reference opening principles, typical structures, and typical plans for the pawn skeleton on the board.",
  },
  {
    id: "endgame",
    name: "Endgame",
    emoji: "♜",
    blurb: "Technique and precision.",
    tone: "Talk in terms of king activity, pawn structure, opposition, file control, and conversion technique.",
  },
  {
    id: "tournament",
    name: "Tournament",
    emoji: "🏆",
    blurb: "Practical competitive advice.",
    tone: "Pragmatic. Factor in clock usage, practical chances, opponent resources, and risk management.",
  },
  {
    id: "beginner",
    name: "Beginner Guide",
    emoji: "🌱",
    blurb: "Simple language, core ideas.",
    tone: "Elementary vocabulary. One concept at a time, no notation-heavy lines, use everyday analogies.",
  },
  {
    id: "advanced",
    name: "Advanced",
    emoji: "🎓",
    blurb: "Deep, no hand-holding.",
    tone: "Assumes strong fundamentals. Discuss nuances, candidate moves, and long-term structural implications.",
  },
  {
    id: "engine-analyst",
    name: "Engine Analyst",
    emoji: "🖥️",
    blurb: "Data-dense reporting.",
    tone: "Report depth, evals, PV and node facts plainly, then interpret them briefly. Cite the numbers exactly as given.",
  },
];

export const DEFAULT_PERSONALITY_ID = "professional";

export function getPersonality(id: string): Personality {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0]!;
}
