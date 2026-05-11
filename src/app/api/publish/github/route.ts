import { createOrUpdateGitHubRepo, type PublishFile } from "@/lib/publish/server";

export const dynamic = "force-dynamic";

type GitHubPublishRequest = {
  token: string;
  repoName: string;
  isPrivate: boolean;
  files: PublishFile[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GitHubPublishRequest;
    if (!body.token) return Response.json({ error: "Missing GitHub token" }, { status: 400 });

    const result = await createOrUpdateGitHubRepo(body);
    return Response.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub publish failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
