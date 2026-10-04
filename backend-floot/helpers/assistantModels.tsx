/**
 * Models the user can pick. Shared by the backend (validation/dispatch) and
 * every client (web, Flutter, Android Auto mirror these ids).
 */
export const assistantModels = {
  // Gemini has a free tier, so it is the default until paid keys have credit.
  defaultModel: "gemini-flash-lite-latest",
  list: [
    {
      id: "gemini-flash-lite-latest",
      provider: "google",
      label: "Gemini Flash Lite",
      note: "Gratis, rápido (recomendado)",
    },
    {
      id: "gemini-3.8-flash",
      provider: "google",
      label: "Gemini 3.8 Flash",
      note: "Gratis pero solo ~20 consultas al día; más listo",
    },
    {
      id: "claude-opus-5-5",
      provider: "anthropic",
      label: "Claude Opus 5.5",
      note: "El más inteligente de Claude",
    },
    {
      id: "claude-sonnet-5-5",
      provider: "anthropic",
      label: "Claude Sonnet 5.5",
      note: "Equilibrado, más barato",
    },
    {
      id: "claude-haiku-4-5",
      provider: "anthropic",
      label: "Claude Haiku 4.5",
      note: "El más rápido y barato de Claude",
    },
    {
      id: "gpt-6-luna",
      provider: "openai",
      label: "ChatGPT · GPT-6 Luna",
      note: "Rápido y muy barato",
    },
    {
      id: "gpt-6.1-sol",
      provider: "openai",
      label: "ChatGPT · GPT-6.1 Sol",
      note: "El más potente de OpenAI",
    },
  ],
} as const;

export type AssistantModelId = (typeof assistantModels.list)[number]["id"];
export type AssistantProvider = (typeof assistantModels.list)[number]["provider"];
