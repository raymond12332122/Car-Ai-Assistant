import { flootAi } from "@floot/ai";
import { geoServices, type PlaceCategory } from "./geoServices";
import type {
  AssistantAction,
  ChatMessage,
  GeoLocation,
  OutputType,
  Place,
} from "../endpoints/assistant/chat_POST.schema";

type Surface = "car" | "phone" | "web";

const MODEL = "gpt-6-luna";
const MAX_TOOL_ROUNDS = 4;

const RESPONSE_FORMAT = {
  type: "json_schema",
  name: "car_assistant_reply",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "speech", "action"],
    properties: {
      reply: { type: "string", description: "Answer to show on screen. Plain text, no markdown." },
      speech: { type: "string", description: "Very short version to read aloud while driving." },
      action: {
        type: "object",
        additionalProperties: false,
        required: ["type", "destinationName", "lat", "lng", "address", "phone"],
        properties: {
          type: { type: "string", enum: ["none", "navigate", "show_places", "call"] },
          destinationName: { type: ["string", "null"] },
          lat: { type: ["number", "null"] },
          lng: { type: ["number", "null"] },
          address: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const TOOLS = [
  { type: "web_search" },
  {
    type: "function",
    name: "search_nearby_places",
    description:
      "Find real places near the driver's current GPS position (OpenStreetMap). Use for gas stations, EV chargers, food, parking, hospitals, pharmacies, ATMs, workshops, hotels, etc.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["category", "keyword", "radius_meters"],
      properties: {
        category: { type: "string", enum: geoServices.categories },
        keyword: {
          type: ["string", "null"],
          description: "Optional brand/name filter, e.g. 'Pemex', 'Starbucks', 'Tesla'.",
        },
        radius_meters: {
          type: ["number", "null"],
          description: "Search radius, default 5000, max 25000.",
        },
      },
    },
  },
  {
    type: "function",
    name: "find_destination",
    description:
      "Look up the coordinates of an address, city, landmark or business by name, so the driver can navigate there.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string" } },
    },
  },
];

function buildInstructions(params: {
  surface: Surface;
  language: string;
  location: GeoLocation | null | undefined;
  locationLabel: string | null;
}) {
  const now = new Date().toISOString();
  const loc = params.location
    ? `Driver GPS: ${params.location.lat.toFixed(5)}, ${params.location.lng.toFixed(5)}${
        params.locationLabel ? ` (${params.locationLabel})` : ""
      }${params.location.speedKmh != null ? `, speed ${Math.round(params.location.speedKmh)} km/h` : ""}.`
    : "Driver location is unknown. If a request needs it, ask the user to enable location.";
  const driving =
    params.surface === "car"
      ? "The user is DRIVING and hears your answer through the car speakers (Android Auto). `reply` max 2 short sentences, `speech` max ~20 words."
      : "The user may be in the car using the phone app. Keep `reply` concise (max ~4 sentences) and `speech` under ~35 words.";

  return [
    "You are Copiloto, a friendly in-car AI assistant (like a smart co-driver).",
    `Always answer in the user's language; default locale ${params.language}.`,
    driving,
    "Safety first: never encourage reading, typing or watching video while driving; suggest pulling over for anything long. Never invent places, prices or opening hours.",
    "For places near the driver, call search_nearby_places. For a named destination, call find_destination. For news, weather, traffic info, sports, prices or general facts, use web_search.",
    "Actions: when the user wants to go somewhere specific, set action.type='navigate' with destinationName, lat, lng (from tool results). When you list nearby options, set action.type='show_places' (the app shows the cards), mention the closest 2-3 by name and distance. To phone a place, action.type='call' with phone. Otherwise 'none' with nulls.",
    "Distances: use km with one decimal above 1 km, meters below. No markdown, no URLs, no emojis in `speech`.",
    loc,
    `Current time (UTC): ${now}.`,
  ].join("\n");
}

function extractText(output: any[]): string {
  return output
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c: any) => c.type === "output_text")
    .map((c: any) => c.text)
    .join("\n")
    .trim();
}

const NO_ACTION: AssistantAction = {
  type: "none",
  destinationName: null,
  lat: null,
  lng: null,
  address: null,
  phone: null,
};

async function runTool(
  name: string,
  rawArgs: string,
  ctx: { location: GeoLocation | null | undefined; language: string },
): Promise<{ result: unknown; places: Place[] }> {
  const args = JSON.parse(rawArgs || "{}");
  try {
    if (name === "search_nearby_places") {
      if (!ctx.location) {
        return { result: { error: "Location unavailable. Ask the user to enable GPS." }, places: [] };
      }
      const places = await geoServices.searchNearby({
        category: args.category as PlaceCategory,
        keyword: args.keyword,
        radiusMeters: args.radius_meters,
        lat: ctx.location.lat,
        lng: ctx.location.lng,
      });
      return { result: places.length ? places : { results: [], note: "Nothing found in radius; try a larger radius." }, places };
    }
    if (name === "find_destination") {
      const places = await geoServices.geocode({
        query: String(args.query ?? ""),
        near: ctx.location ?? null,
        language: ctx.language,
      });
      return { result: places.length ? places : { results: [] }, places };
    }
    return { result: { error: `Unknown tool ${name}` }, places: [] };
  } catch (err) {
    console.error(`Tool ${name} failed`, err);
    return { result: { error: "The map service is temporarily unavailable." }, places: [] };
  }
}

async function run(params: {
  messages: ChatMessage[];
  location?: GeoLocation | null;
  language: string;
  surface: Surface;
}): Promise<OutputType> {
  const locationLabel = params.location
    ? await geoServices.reverseGeocode({
        lat: params.location.lat,
        lng: params.location.lng,
        language: params.language,
      })
    : null;

  const instructions = buildInstructions({
    surface: params.surface,
    language: params.language,
    location: params.location,
    locationLabel,
  });

  let input: any[] = params.messages.map((m) => ({
    type: "message",
    role: m.role,
    content: m.content,
  }));
  let lastPlaces: Place[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const r: any = await flootAi.chat({
      model: MODEL,
      instructions,
      input,
      tools: round < MAX_TOOL_ROUNDS ? (TOOLS as any) : undefined,
      reasoning: { effort: "low" },
      text: { format: RESPONSE_FORMAT },
      max_output_tokens: 1200,
    } as any);

    const calls = (r.output ?? []).filter((o: any) => o.type === "function_call");
    if (calls.length === 0) {
      const text = extractText(r.output ?? []);
      let parsed: { reply: string; speech: string; action: AssistantAction } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const reply = parsed?.reply?.trim() || text || "Lo siento, no pude responder.";
      const action = parsed?.action ?? NO_ACTION;
      return {
        reply,
        speech: parsed?.speech?.trim() || reply,
        action,
        places: action.type === "show_places" || action.type === "navigate" ? lastPlaces : [],
      };
    }

    const outputs: any[] = [];
    for (const call of calls) {
      const { result, places } = await runTool(call.name, call.arguments, {
        location: params.location,
        language: params.language,
      });
      if (places.length) lastPlaces = places;
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
    input = [...input, ...r.output, ...outputs];
  }

  throw new Error("The assistant could not finish the request.");
}

async function transcribe(params: {
  audioBase64: string;
  mimeType: string;
  language: string;
}): Promise<string> {
  const r: any = await flootAi.transcribe({
    model: "gemini-3.5-transcribe",
    input: [{ type: "audio", data: params.audioBase64, mime_type: params.mimeType }],
    generation_config: {
      transcription_config: { mode: "smart", language_codes: [params.language] },
    },
  } as any);
  return String(r.output_text ?? "").trim();
}

export const carAssistant = { run, transcribe };
