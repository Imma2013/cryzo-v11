export function builderError(raw: string) {
  try {
    const value = JSON.parse(raw);
    return { message: typeof value.message === "string" ? value.message : "The request could not complete. Please retry.",
      requestId: typeof value.requestId === "string" ? value.requestId : undefined,
      retryable: value.retryable !== false };
  } catch {
    return { message: raw || "The request could not complete.", requestId: undefined, retryable: true };
  }
}
