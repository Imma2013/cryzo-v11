/** JSON Schema keys are protocol data, not Convex object field names. */
export type StoredMcpTool = {
  name: string;
  description?: string;
  inputSchemaJson: string;
  enabled?: boolean;
};

export function encodeMcpTool(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
  enabled?: boolean;
}): StoredMcpTool {
  const inputSchemaJson = JSON.stringify(
    tool.inputSchema ?? { type: "object", properties: {} },
  );
  if (new TextEncoder().encode(inputSchemaJson).length > 700_000)
    throw new Error(
      `The schema for ${tool.name} exceeds the supported tool size.`,
    );
  return {
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    inputSchemaJson,
    enabled: tool.enabled !== false,
  };
}

export function decodeMcpTool<
  T extends { inputSchemaJson?: string; inputSchema?: unknown },
>(tool: T) {
  return {
    ...tool,
    inputSchema: tool.inputSchemaJson
      ? JSON.parse(tool.inputSchemaJson)
      : tool.inputSchema,
  };
}

export function mcpConnectionError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  const authorizationRequired =
    /\b401\b|\b403\b|unauthoriz|authorization required|requires.*(?:OAuth|API key)|session expired|invalid.*token|bearer header/i.test(
      detail,
    );
  return {
    authorizationRequired,
    message: authorizationRequired
      ? "Authorization is required. Connect this server or update its API key."
      : "Could not verify this server’s tools. Your saved connection is preserved; try reconnecting.",
    detail: detail
      .replace(
        /(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
        "[credential redacted]",
      )
      .replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/gi, "$1?[redacted]")
      .slice(0, 1000),
  };
}
