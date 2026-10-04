import superjson from "superjson";
import { schema, OutputType } from "./voice_POST.schema";
import { parseRequestBody } from "../../helpers/parseRequestBody";
import { carAssistant } from "../../helpers/carAssistant";
import { aiErrorResponse } from "../../helpers/aiErrorResponse";

// Android Auto records from the car microphone (CarAudioRecord) and sends
// the clip here: transcribe → assistant → reply in one round trip.
export const flootPublic = true;

export async function handle(request: Request) {
  try {
    const input = schema.parse(await parseRequestBody(request));
    const transcript = await carAssistant.transcribe({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
      language: input.language,
    });
    if (!transcript) {
      return new Response(
        superjson.stringify({
          error: "No escuché nada. Intenta de nuevo.",
          code: "EMPTY_TRANSCRIPT",
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }
    const result = await carAssistant.run({
      messages: [...input.history, { role: "user", content: transcript }],
      location: input.location,
      language: input.language,
      surface: input.surface,
    });
    return new Response(
      superjson.stringify({ ...result, transcript } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
