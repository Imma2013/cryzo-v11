// Compatibility endpoint; current clients use /api/expo.
export { GET, HEAD, OPTIONS } from "@/app/api/expo/t/[sessionId]/[[...path]]/route";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
