import { z } from "zod";
import superjson from "superjson";
import { locationSchema, messageSchema, OutputType as ChatOutput } from "./chat_POST.schema";

// ~3.5 MB of base64 keeps the whole Floot AI call under its 5 MB cap.
export const schema = z.object({
  audioBase64: z.string().min(100).max(3_500_000),
  mimeType: z.enum([
    "audio/wav",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
    "audio/mpeg",
    "audio/aac",
    "audio/flac",
  ]),
  history: z.array(messageSchema).max(19).default([]),
  location: locationSchema.nullish(),
  language: z.string().min(2).max(10).default("es-MX"),
  surface: z.enum(["car", "phone", "web"]).default("car"),
  model: z.string().max(60).nullish(),
});

export type InputType = z.input<typeof schema>;
export type OutputType = ChatOutput & { transcript: string };

export const postAssistantVoice = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/assistant/voice`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string; code?: string }>(
      await result.text(),
    );
    const err = new Error(errorObject.error) as Error & { code?: string };
    err.code = errorObject.code;
    throw err;
  }
  return superjson.parse<OutputType>(await result.text());
};
