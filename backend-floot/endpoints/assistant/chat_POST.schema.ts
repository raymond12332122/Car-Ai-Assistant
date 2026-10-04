import { z } from "zod";
import superjson from "superjson";

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmh: z.number().min(0).max(400).nullish(),
});

export const schema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  location: locationSchema.nullish(),
  language: z.string().min(2).max(10).default("es-MX"),
  // "car" = Android Auto / driving: very short spoken answers.
  surface: z.enum(["car", "phone", "web"]).default("web"),
});

export type InputType = z.input<typeof schema>;
export type ChatMessage = z.infer<typeof messageSchema>;
export type GeoLocation = z.infer<typeof locationSchema>;

export type Place = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  distanceMeters: number | null;
  address: string | null;
  phone: string | null;
  openingHours: string | null;
};

export type AssistantAction = {
  type: "none" | "navigate" | "show_places" | "call";
  destinationName: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  phone: string | null;
};

export type OutputType = {
  /** Full answer to show on screen (plain text, no markdown). */
  reply: string;
  /** Short version meant to be spoken aloud by TTS. */
  speech: string;
  action: AssistantAction;
  places: Place[];
  /** Transcript of the user's audio, only set by /assistant/voice. */
  transcript?: string;
};

export const postAssistantChat = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/assistant/chat`, {
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
