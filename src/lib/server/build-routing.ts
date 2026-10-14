import type { ProjectPlatform } from "@/lib/project-platform";

const MUTATION_SIGNAL =
  /\b(?:build|create|make|develop|implement|generate|add|remove|delete|change|update|fix|repair|edit|rewrite|replace|redesign|refactor|move|rename|install|configure|connect|integrate|set ?up|enable|disable|deploy|publish|restore|revert)\b/i;

const MOBILE_BACKEND_SIGNAL =
  /\b(?:database|backend|server|cloud sync|sync across devices|account|accounts|profile|profiles|sign[ -]?in|sign[ -]?up|login|authentication|auth|persistent storage|remote storage|shared data|realtime|real-time)\b/i;

export function shouldMutateProject(prompt: string, automaticRepair = false) {
  if (automaticRepair) return true;
  if (/\[User selected element:/i.test(prompt)) return true;
  return MUTATION_SIGNAL.test(prompt);
}

export function shouldProvisionDatabase({
  mode,
  platforms,
  prompt,
}: {
  mode: "build" | "plan";
  platforms: readonly ProjectPlatform[];
  prompt: string;
}) {
  if (mode !== "build") return false;
  if (platforms.includes("web")) return true;
  return MOBILE_BACKEND_SIGNAL.test(prompt);
}
