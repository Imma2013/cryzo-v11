export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseProject = {
  id?: string;
  ref?: string;
  name?: string;
  organization_id?: string;
  region?: string;
  status?: string;
};

export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as { token?: string };
    if (!token?.trim()) {
      return Response.json({ error: "Missing Supabase access token" }, { status: 400 });
    }

    const response = await fetch("https://api.supabase.com/v1/projects", {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      let detail = "Supabase token validation failed";
      try {
        const payload = (await response.json()) as { message?: string; error?: string };
        detail = payload.message || payload.error || detail;
      } catch {}
      return Response.json({ error: detail }, { status: response.status });
    }

    const projects = (await response.json()) as SupabaseProject[];
    return Response.json({
      success: true,
      projects: projects.map((project) => ({
        id: project.ref || project.id,
        name: project.name || project.ref || project.id || "Supabase project",
        region: project.region,
        status: project.status,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase validation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
