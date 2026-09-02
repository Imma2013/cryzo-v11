import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";

function bearerToken(req: Request) {
  const authorization = req.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function requireRequestUserId(req: Request) {
  const token = bearerToken(req);
  if (!token) return null;

  try {
    const user = await fetchQuery(api.users.currentUser, {}, { token });
    return user?._id ? String(user._id) : null;
  } catch (error) {
    console.warn("[request-auth] Unable to resolve Convex user", error);
    return null;
  }
}
