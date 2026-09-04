type ReasoningOptions = {
  supportsMaxTokens?: boolean;
  supportedEfforts?: (string | null)[] | null;
  mandatory?: boolean;
};
export function reasoningConfig(info?: ReasoningOptions) {
  if (info?.supportsMaxTokens) return { max_tokens: 1024 };
  const efforts = info?.supportedEfforts;
  for (const effort of ["low", "minimal", "medium", "high"] as const) {
    if (efforts == null || efforts.includes(effort)) return { effort };
  }
  if (!info?.mandatory) return { enabled: false, effort: "none" as const };
  return undefined;
}
