export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiKey = {
  id?: string;
  name?: string;
  type?: string;
  api_key?: string;
  prefix?: string;
};

export async function POST(req: Request) {
  try {
    const { token, projectRef } = (await req.json()) as {
      token?: string;
      projectRef?: string;
    };
    if (!token?.trim() || !projectRef?.trim()) {
      return Response.json({ error: "Missing Supabase token or project" }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/json",
    };
    const [projectResponse, keysResponse] = await Promise.all([
      fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef.trim())}`, {
        headers,
        cache: "no-store",
      }),
      fetch(
        `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef.trim())}/api-keys?reveal=true`,
        { headers, cache: "no-store" },
      ),
    ]);

    if (!projectResponse.ok) {
      return Response.json(
        { error: `Unable to load Supabase project (${projectResponse.status})` },
        { status: projectResponse.status },
      );
    }
    if (!keysResponse.ok) {
      return Response.json(
        { error: `Unable to read Supabase project keys (${keysResponse.status}). Make sure the token has secrets:read access.` },
        { status: keysResponse.status },
      );
    }

    const project = (await projectResponse.json()) as {
      id?: string;
      ref?: string;
      name?: string;
    };
    const keys = (await keysResponse.json()) as ApiKey[];
    const publicKey =
      keys.find((key) =>
        [key.name, key.type, key.prefix]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .match(/anon|publishable/),
      )?.api_key || "";

    if (!publicKey) {
      return Response.json(
        { error: "No Supabase anon/publishable key was available for this project." },
        { status: 409 },
      );
    }

    const ref = project.ref || project.id || projectRef.trim();
    return Response.json({
      success: true,
      project: {
        ref,
        name: project.name || ref,
        url: `https://${ref}.supabase.co`,
        publicKey,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase project lookup failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
