import superjson from "superjson";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ApiError as GeminiApiError } from "@google/genai";
import { ZodError } from "zod";
import { ProviderNotConfiguredError } from "./carAssistant";

/** Maps an error thrown by an assistant endpoint to an HTTP response. */
export function aiErrorResponse(error: unknown): Response {
  const respond = (status: number, body: { error: string; code: string }) =>
    new Response(superjson.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (error instanceof ProviderNotConfiguredError) {
    return respond(503, { error: error.message, code: "PROVIDER_NOT_CONFIGURED" });
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return respond(400, { error: `Solicitud inválida: ${error.message}`, code: "BAD_REQUEST" });
  }

  const provider =
    error instanceof Anthropic.APIError
      ? "Claude"
      : error instanceof OpenAI.APIError
        ? "OpenAI"
        : error instanceof GeminiApiError
          ? "Gemini"
          : null;
  if (provider) {
    const status = (error as { status?: number }).status ?? 502;
    console.error(`${provider} API error`, status, (error as Error).message);
    if (status === 401 || status === 403) {
      return respond(502, { error: `La llave de ${provider} no es válida o no tiene permiso.`, code: "INVALID_KEY" });
    }
    if (status === 429 && provider === "Gemini") {
      return respond(429, {
        error: "Llegaste al límite gratis de Gemini por ahora. Espera un minuto o elige otro modelo.",
        code: "RATE_LIMITED",
      });
    }
    if (status === 429) {
      return respond(429, {
        error: `${provider} rechazó la solicitud por límite o falta de saldo. Revisa tu cuenta de ${provider}.`,
        code: "RATE_LIMITED",
      });
    }
    if (status === 400) {
      return respond(502, { error: `${provider}: ${(error as Error).message}`, code: "PROVIDER_BAD_REQUEST" });
    }
    return respond(502, { error: `${provider} falló (${status}). Intenta de nuevo.`, code: "UPSTREAM" });
  }

  console.error("Assistant endpoint error", error);
  return respond(500, {
    error: error instanceof Error ? error.message : "Unknown error",
    code: "INTERNAL",
  });
}
