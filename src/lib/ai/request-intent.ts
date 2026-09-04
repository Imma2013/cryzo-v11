export type RequestIntent = "build" | "discuss";

// Build mode is permission to edit when asked, not a command to build on every turn.
export function requestIntent(text: string, mode: string): RequestIntent {
  if (mode !== "build") return "discuss";
  const prompt = text.trim();
  if (/^(hi|hello|hey|thanks|thank you|good (morning|afternoon|evening))[!.\s]*$/i.test(prompt)) return "discuss";
  if (/^(what|why|how|explain|describe|tell me|is |are |do you|which)\b/i.test(prompt)) return "discuss";
  if (/\b(build|create|make|implement|add|remove|change|update|fix|edit|replace|redesign|restyle|rebuild|develop)\b/i.test(prompt)) return "build";
  if (/^(continue|go ahead|do it|yes,? please|proceed)\b/i.test(prompt)) return "build";
  return "discuss";
}

export const DISCUSSION_PROMPT = "You are Cryzo, a helpful website-building assistant. Answer the user's actual question conversationally. This turn is discussion only: do not create artifacts, files, shell commands, cloud resources, or claim to execute actions. If the request is ambiguous, ask one concise clarification before building.";

export function transientProviderFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|500|502|503|504)\b|rate.?limit|temporarily unavailable|overloaded|ECONNRESET|fetch failed|did not finish|returned no text|empty response/i.test(message);
}
