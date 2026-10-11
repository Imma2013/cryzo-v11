/** Parse one AI SDK UI-message SSE frame; neutral toward chunk boundaries. */
export function parseGenerationFrame(line: string): { delta?: string; error?: string } {
  if (!line.startsWith("data: ")) return {};
  const raw = line.slice(6);
  if (raw === "[DONE]") return {};
  try {
    const event = JSON.parse(raw);
    if (event.type === "text-delta" && typeof event.delta === "string") return { delta: event.delta };
    if (event.type === "error") return { error: String(event.errorText || "Model stream failed") };
  } catch (error) {
    if (error instanceof SyntaxError) return {};
    throw error;
  }
  return {};
}
