import superjson from "superjson";
import {
  FlootAiOutOfCreditsError,
  FlootAiRateLimitError,
  FlootAiUpstreamError,
} from "@floot/ai";
import { ZodError } from "zod";

/** Maps an error thrown by an assistant endpoint to an HTTP response. */
export function aiErrorResponse(error: unknown): Response {
  const respond = (status: number, body: { error: string; code?: string }) =>
    new Response(superjson.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (error instanceof FlootAiOutOfCreditsError) {
    return respond(503, {
      error: "AI features are temporarily unavailable. Please contact the app owner.",
      code: "OUT_OF_CREDITS",
    });
  }
  if (error instanceof FlootAiRateLimitError) {
    return respond(429, { error: "Demasiadas solicitudes. Intenta en un minuto.", code: "RATE_LIMITED" });
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return respond(400, { error: `Solicitud inválida: ${error.message}`, code: "BAD_REQUEST" });
  }
  if (error instanceof FlootAiUpstreamError) {
    console.error("AI upstream error", error);
    return respond(502, { error: "El servicio de IA falló. Intenta de nuevo.", code: "UPSTREAM" });
  }
  console.error("Assistant endpoint error", error);
  return respond(500, {
    error: error instanceof Error ? error.message : "Unknown error",
    code: "INTERNAL",
  });
}
