export async function POST() {
  return Response.json({ error: "Message-credit top-ups are no longer sold. Upgrade your plan or use your own model key. No payment was created." }, { status: 410 });
}
