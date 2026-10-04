import superjson from "superjson";

/**
 * Parses a request body sent either by the web app (superjson envelope
 * `{ json, meta }`) or by the native Android / Android Auto clients
 * (plain JSON, optionally wrapped in `{ json }`).
 */
export async function parseRequestBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) throw new Error("Empty request body");
  const raw = JSON.parse(text);
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "json" in raw) {
    return superjson.deserialize(raw);
  }
  return raw;
}
