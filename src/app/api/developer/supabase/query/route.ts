export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DESTRUCTIVE_SQL = /\b(drop\s+(table|schema|database)|truncate\s+table|delete\s+from\s+[^;]+(?:;|$))\b/i;

export async function POST(req: Request) {
  try {
    const { token, projectRef, query, allowDestructive } = (await req.json()) as {
      token?: string;
      projectRef?: string;
      query?: string;
      allowDestructive?: boolean;
    };

    if (!token?.trim() || !projectRef?.trim() || !query?.trim()) {
      return Response.json({ error: "Missing Supabase token, project, or SQL query" }, { status: 400 });
    }
    if (!allowDestructive && DESTRUCTIVE_SQL.test(query)) {
      return Response.json(
        { error: "Destructive SQL is blocked unless the user explicitly approves it." },
        { status: 409 },
      );
    }

    const response = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef.trim())}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query: query.trim() }),
        cache: "no-store",
      },
    );

    const raw = await response.text();
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {}

    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? String((data as { message?: unknown }).message || "Supabase query failed")
          : raw || `Supabase query failed (${response.status})`;
      return Response.json({ error: message }, { status: response.status });
    }

    return Response.json({ success: true, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase query failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
