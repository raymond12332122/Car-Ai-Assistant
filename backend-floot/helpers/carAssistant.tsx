import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { toFile } from "openai";
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  ThinkingLevel,
  type Content,
  type Part,
} from "@google/genai";
import { geoServices, type PlaceCategory } from "./geoServices";
import {
  assistantModels,
  type AssistantModelId,
  type AssistantProvider,
} from "./assistantModels";
import type {
  AssistantAction,
  ChatMessage,
  GeoLocation,
  OutputType,
  Place,
} from "../endpoints/assistant/chat_POST.schema";

type Surface = "car" | "phone" | "web";
type FinalAnswer = { reply: string; speech: string; action: AssistantAction };

const MAX_ROUNDS = 5;

/** Thrown when the chosen provider has no API key connected. */
export class ProviderNotConfiguredError extends Error {
  constructor(public provider: AssistantProvider) {
    super(
      provider === "anthropic"
        ? "Falta conectar la llave de Claude (ANTHROPIC_API_KEY)."
        : provider === "openai"
          ? "Falta conectar la llave de OpenAI (OPENAI_API_KEY)."
          : "Falta conectar la llave de Gemini (GEMINI_API_KEY).",
    );
  }
}

function apiKey(provider: AssistantProvider): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  const key =
    provider === "anthropic"
      ? env["ANTHROPIC_API_KEY"]
      : provider === "openai"
        ? env["OPENAI_API_KEY"]
        : env["GEMINI_API_KEY"];
  return key && key.trim() ? key.trim() : undefined;
}

function configuredProviders(): Record<AssistantProvider, boolean> {
  return {
    anthropic: !!apiKey("anthropic"),
    openai: !!apiKey("openai"),
    google: !!apiKey("google"),
  };
}

function anthropicClient() {
  const key = apiKey("anthropic");
  if (!key) throw new ProviderNotConfiguredError("anthropic");
  return new Anthropic({ apiKey: key, maxRetries: 1, timeout: 90_000 });
}

function openaiClient() {
  const key = apiKey("openai");
  if (!key) throw new ProviderNotConfiguredError("openai");
  return new OpenAI({ apiKey: key, maxRetries: 1, timeout: 90_000 });
}

function geminiClient() {
  const key = apiKey("google");
  if (!key) throw new ProviderNotConfiguredError("google");
  return new GoogleGenAI({ apiKey: key });
}

// ---------------------------------------------------------------------------
// Shared prompt + tools
// ---------------------------------------------------------------------------

const ACTION_SCHEMA = {
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
} as const;

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "speech", "action"],
  properties: {
    reply: { type: "string", description: "Answer to show on screen. Plain text, no markdown." },
    speech: { type: "string", description: "Very short version to read aloud while driving." },
    action: ACTION_SCHEMA,
  },
} as const;

const NEARBY_SCHEMA = {
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
};

const DESTINATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: { query: { type: "string" } },
};

const NEARBY_DESCRIPTION =
  "Find real places near the driver's current GPS position (OpenStreetMap). Use for gas stations, EV chargers, food, parking, hospitals, pharmacies, ATMs, workshops, hotels, etc.";
const DESTINATION_DESCRIPTION =
  "Look up the coordinates of an address, city, landmark or business by name, so the driver can navigate there.";
const WEATHER_DESCRIPTION =
  "Current weather and today's/tomorrow's forecast. Uses the driver's GPS unless a place name is given.";
const WEATHER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["place"],
  properties: {
    place: {
      type: ["string", "null"],
      description: "City or place name for another location; null for the driver's current position.",
    },
  },
};

function buildInstructions(params: {
  surface: Surface;
  language: string;
  location: GeoLocation | null | undefined;
  locationLabel: string | null;
  finalStep: string;
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
    "For places near the driver, call search_nearby_places. For a named destination, call find_destination. For weather, call get_weather. For news, traffic info, sports, prices or other current facts, use web search (at most once or twice).",
    "Actions: when the user wants to go somewhere specific, set action.type='navigate' with destinationName, lat, lng (from tool results). When you list nearby options, set action.type='show_places' (the app shows the cards), mention the closest 2-3 by name and distance. To phone a place, action.type='call' with phone. Otherwise 'none' with nulls.",
    "Distances: use km with one decimal above 1 km, meters below. No markdown, no URLs, no emojis in `speech`.",
    params.finalStep,
    loc,
    `Current time (UTC): ${now}.`,
  ].join("\n");
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
  args: any,
  ctx: { location: GeoLocation | null | undefined; language: string },
): Promise<{ result: unknown; places: Place[] }> {
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
      return {
        result: places.length ? places : { results: [], note: "Nothing found in radius; try a larger radius." },
        places,
      };
    }
    if (name === "find_destination") {
      const places = await geoServices.geocode({
        query: String(args.query ?? ""),
        near: ctx.location ?? null,
        language: ctx.language,
      });
      return { result: places.length ? places : { results: [] }, places };
    }
    if (name === "get_weather") {
      let point = ctx.location ? { lat: ctx.location.lat, lng: ctx.location.lng } : null;
      let placeName: string | null = null;
      if (args.place) {
        const [found] = await geoServices.geocode({ query: String(args.place), near: null, language: ctx.language });
        if (found) {
          point = { lat: found.lat, lng: found.lng };
          placeName = found.address;
        }
      }
      if (!point) return { result: { error: "Location unavailable. Ask for a city name." }, places: [] };
      return { result: { place: placeName ?? "driver location", ...(await geoServices.weather(point)) }, places: [] };
    }
    return { result: { error: `Unknown tool ${name}` }, places: [] };
  } catch (err) {
    console.error(`Tool ${name} failed`, err);
    return { result: { error: "The map service is temporarily unavailable." }, places: [] };
  }
}

function normalizeAnswer(parsed: Partial<FinalAnswer> | null, fallbackText: string): FinalAnswer {
  const reply = parsed?.reply?.trim() || fallbackText.trim() || "Lo siento, no pude responder.";
  return {
    reply,
    speech: parsed?.speech?.trim() || reply,
    action: parsed?.action ?? NO_ACTION,
  };
}

type RunContext = {
  model: AssistantModelId;
  instructions: (finalStep: string) => string;
  messages: ChatMessage[];
  location: GeoLocation | null | undefined;
  language: string;
  onPlaces: (places: Place[]) => void;
};

// ---------------------------------------------------------------------------
// Claude (Anthropic Messages API)
// ---------------------------------------------------------------------------

async function runClaude(ctx: RunContext): Promise<FinalAnswer> {
  const client = anthropicClient();
  const isHaiku = ctx.model === "claude-haiku-4-5";
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    isHaiku
      ? { type: "web_search_20250305", name: "web_search", max_uses: 2 }
      : { type: "web_search_20260209", name: "web_search", max_uses: 2 },
    {
      name: "search_nearby_places",
      description: NEARBY_DESCRIPTION,
      strict: true,
      input_schema: NEARBY_SCHEMA as any,
    },
    {
      name: "find_destination",
      description: DESTINATION_DESCRIPTION,
      strict: true,
      input_schema: DESTINATION_SCHEMA as any,
    },
    {
      name: "get_weather",
      description: WEATHER_DESCRIPTION,
      strict: true,
      input_schema: WEATHER_SCHEMA as any,
    },
    {
      name: "respond",
      description:
        "Deliver the final answer to the driver. Always finish every turn by calling this tool exactly once.",
      strict: true,
      input_schema: ANSWER_SCHEMA as any,
    },
  ];
  const system = ctx.instructions(
    "When you have the answer, call the `respond` tool with reply, speech and action. Do not write the answer as plain text.",
  );
  const messages: Anthropic.Beta.BetaMessageParam[] = ctx.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let lastText = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: ctx.model,
      max_tokens: 4000,
      system,
      tools,
      messages,
      // Haiku 4.5 takes no effort parameter; on Opus/Sonnet 5.5 "low" keeps
      // replies fast for a driver who is waiting.
      ...(isHaiku
        ? {}
        : {
            output_config: { effort: "low" as const },
            // Re-run a safety-declined request on Anthropic's recommended model.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default" as const,
          }),
    });

    if (response.stop_reason === "refusal") {
      return normalizeAnswer(null, "No puedo ayudar con eso. ¿Te ayudo con otra cosa?");
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    if (text) lastText = text;

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    const respond = toolUses.find((t) => t.name === "respond");
    if (respond) return normalizeAnswer(respond.input as FinalAnswer, lastText);

    messages.push({ role: "assistant", content: response.content as any });

    if (response.stop_reason === "pause_turn") continue;
    if (toolUses.length === 0) return normalizeAnswer(null, lastText);

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      const { result, places } = await runTool(tool.name, tool.input, ctx);
      if (places.length) ctx.onPlaces(places);
      results.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: results });
  }
  return normalizeAnswer(null, lastText);
}

// ---------------------------------------------------------------------------
// ChatGPT (OpenAI Responses API)
// ---------------------------------------------------------------------------

async function runOpenAI(ctx: RunContext): Promise<FinalAnswer> {
  const client = openaiClient();
  const tools: any[] = [
    { type: "web_search" },
    {
      type: "function",
      name: "search_nearby_places",
      description: NEARBY_DESCRIPTION,
      strict: true,
      parameters: NEARBY_SCHEMA,
    },
    {
      type: "function",
      name: "find_destination",
      description: DESTINATION_DESCRIPTION,
      strict: true,
      parameters: DESTINATION_SCHEMA,
    },
    {
      type: "function",
      name: "get_weather",
      description: WEATHER_DESCRIPTION,
      strict: true,
      parameters: WEATHER_SCHEMA,
    },
  ];
  const instructions = ctx.instructions("Return the final answer in the required JSON format.");
  let input: any[] = ctx.messages.map((m) => ({ type: "message", role: m.role, content: m.content }));

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const r: any = await client.responses.create({
      model: ctx.model,
      instructions,
      input,
      tools: round < MAX_ROUNDS ? tools : undefined,
      reasoning: { effort: "low" },
      text: {
        format: { type: "json_schema", name: "car_assistant_reply", strict: true, schema: ANSWER_SCHEMA as any },
      },
      max_output_tokens: 2000,
    } as any);

    const output: any[] = r.output ?? [];
    const calls = output.filter((o) => o.type === "function_call");
    if (calls.length === 0) {
      const text = String(r.output_text ?? "").trim();
      let parsed: FinalAnswer | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      return normalizeAnswer(parsed, parsed ? "" : text);
    }

    const outputs: any[] = [];
    for (const call of calls) {
      let args: any = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        args = {};
      }
      const { result, places } = await runTool(call.name, args, ctx);
      if (places.length) ctx.onPlaces(places);
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
    input = [...input, ...output, ...outputs];
  }
  throw new Error("The assistant could not finish the request.");
}

// ---------------------------------------------------------------------------
// Gemini (Google AI Studio, free tier)
// ---------------------------------------------------------------------------

const GEMINI_UTILITY_MODEL = "gemini-3.8-flash";
// Search grounding has its own (smaller) free quota per model; Flash Lite has the most.
const GEMINI_SEARCH_MODEL = "gemini-flash-lite-latest";

type GenerateParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

/** generateContent with retries for Google's transient 500/503 "overloaded" errors. */
async function geminiGenerate(client: GoogleGenAI, params: GenerateParams) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.models.generateContent(params);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (attempt >= 2 || (status !== 500 && status !== 503)) throw err;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
}

// Gemini 2.5 can't mix Google Search grounding with function calling in one
// request, so web search is a function served by a separate grounded call.
async function geminiWebSearch(client: GoogleGenAI, query: string, language: string) {
  const r = await geminiGenerate(client, {
    model: GEMINI_SEARCH_MODEL,
    contents: query,
    config: {
      systemInstruction: `Answer concisely with current facts. Language: ${language}.`,
      tools: [{ googleSearch: {} }],
    },
  });
  return { answer: r.text ?? "" };
}

async function runGemini(ctx: RunContext): Promise<FinalAnswer> {
  const client = geminiClient();
  const declarations = [
    {
      name: "web_search",
      description: "Search the web for news, weather, traffic, sports, prices or general facts.",
      parametersJsonSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    { name: "search_nearby_places", description: NEARBY_DESCRIPTION, parametersJsonSchema: NEARBY_SCHEMA },
    { name: "find_destination", description: DESTINATION_DESCRIPTION, parametersJsonSchema: DESTINATION_SCHEMA },
    { name: "get_weather", description: WEATHER_DESCRIPTION, parametersJsonSchema: WEATHER_SCHEMA },
    {
      name: "respond",
      description:
        "Deliver the final answer to the driver. Always finish every turn by calling this function exactly once.",
      parametersJsonSchema: ANSWER_SCHEMA,
    },
  ];
  const systemInstruction = ctx.instructions(
    "When you have the answer, call the `respond` function with reply, speech and action. Do not write the answer as plain text.",
  );
  const contents: Content[] = ctx.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  let lastText = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Last round: only allow `respond`, so the model must deliver an answer.
    const finalRound = round === MAX_ROUNDS - 1;
    const r = await geminiGenerate(client, {
      model: ctx.model,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: declarations }],
        toolConfig: {
          functionCallingConfig: finalRound
            ? { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: ["respond"] }
            : { mode: FunctionCallingConfigMode.AUTO },
        },
        temperature: 0.4,
        // Gemini 3.x: low thinking keeps answers fast for a driver who waits.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const calls = r.functionCalls ?? [];
    if (r.text) lastText = r.text;
    const respond = calls.find((c) => c.name === "respond");
    if (respond) return normalizeAnswer(respond.args as Partial<FinalAnswer>, lastText);
    if (calls.length === 0) return normalizeAnswer(null, lastText);

    const modelContent = r.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);
    const responses: Part[] = [];
    for (const call of calls) {
      let result: unknown;
      if (call.name === "web_search") {
        try {
          result = await geminiWebSearch(client, String((call.args as any)?.query ?? ""), ctx.language);
        } catch (err) {
          console.error("Gemini web search failed", err);
          result = { error: "Web search is temporarily unavailable." };
        }
      } else {
        const out = await runTool(call.name ?? "", call.args ?? {}, ctx);
        if (out.places.length) ctx.onPlaces(out.places);
        result = out.result;
      }
      responses.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return normalizeAnswer(null, lastText);
}

// ---------------------------------------------------------------------------

function resolveModel(requested: string | null | undefined): AssistantModelId {
  const configured = configuredProviders();
  const known = assistantModels.list.find((m) => m.id === requested);
  if (known) {
    if (!configured[known.provider]) throw new ProviderNotConfiguredError(known.provider);
    return known.id;
  }
  const preferred = assistantModels.list.find(
    (m) => m.id === assistantModels.defaultModel && configured[m.provider],
  );
  const any = preferred ?? assistantModels.list.find((m) => configured[m.provider]);
  if (!any) throw new ProviderNotConfiguredError("anthropic");
  return any.id;
}

async function run(params: {
  messages: ChatMessage[];
  location?: GeoLocation | null;
  language: string;
  surface: Surface;
  model?: string | null;
}): Promise<OutputType> {
  const model = resolveModel(params.model);
  const provider = assistantModels.list.find((m) => m.id === model)!.provider;

  const locationLabel = params.location
    ? await geoServices.reverseGeocode({
        lat: params.location.lat,
        lng: params.location.lng,
        language: params.language,
      })
    : null;

  let lastPlaces: Place[] = [];
  const ctx: RunContext = {
    model,
    messages: params.messages,
    location: params.location,
    language: params.language,
    onPlaces: (p) => {
      lastPlaces = p;
    },
    instructions: (finalStep) =>
      buildInstructions({
        surface: params.surface,
        language: params.language,
        location: params.location,
        locationLabel,
        finalStep,
      }),
  };

  let usedModel: AssistantModelId = model;
  let answer: FinalAnswer;
  if (provider === "anthropic") {
    answer = await runClaude(ctx);
  } else if (provider === "openai") {
    answer = await runOpenAI(ctx);
  } else {
    try {
      answer = await runGemini(ctx);
    } catch (err) {
      // Free-tier quota for the chosen Gemini model ran out: fall back to Flash Lite.
      const status = (err as { status?: number }).status;
      if (status !== 429 || model === GEMINI_SEARCH_MODEL) throw err;
      console.warn(`Gemini quota exhausted for ${model}; falling back to ${GEMINI_SEARCH_MODEL}`);
      usedModel = GEMINI_SEARCH_MODEL;
      answer = await runGemini({ ...ctx, model: GEMINI_SEARCH_MODEL });
    }
  }
  return {
    ...answer,
    places:
      answer.action.type === "show_places" || answer.action.type === "navigate" ? lastPlaces : [],
    model: usedModel,
  };
}

/**
 * Speech-to-text. Uses OpenAI when its key is connected, otherwise Gemini's
 * free tier (Claude has no transcription API).
 */
async function transcribe(params: {
  audioBase64: string;
  mimeType: string;
  language: string;
}): Promise<string> {
  if (!apiKey("openai")) {
    const r = await geminiGenerate(geminiClient(), {
      // Flash Lite: separate (larger) free quota, so transcription doesn't eat the chat model's.
      model: GEMINI_SEARCH_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: params.mimeType, data: params.audioBase64 } },
            {
              text: `Transcribe exactly what the speaker says (language ${params.language}). Output only the transcript. If there is no speech, output nothing.`,
            },
          ],
        },
      ],
      config: { temperature: 0 },
    });
    return String(r.text ?? "").trim();
  }
  const client = openaiClient();
  const ext =
    {
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "audio/aac": "aac",
      "audio/flac": "flac",
    }[params.mimeType] ?? "wav";
  const file = await toFile(Buffer.from(params.audioBase64, "base64"), `voz.${ext}`, {
    type: params.mimeType,
  });
  const result = await client.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    language: params.language.split("-")[0],
  });
  return String(result.text ?? "").trim();
}

export const carAssistant = { run, transcribe, configuredProviders };

