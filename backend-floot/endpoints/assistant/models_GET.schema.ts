import superjson from "superjson";
import type { AssistantModelId, AssistantProvider } from "../../helpers/assistantModels";

export type OutputType = {
  defaultModel: AssistantModelId | null;
  models: Array<{
    id: AssistantModelId;
    provider: AssistantProvider;
    label: string;
    note: string;
    /** False when the provider's API key is not connected yet. */
    available: boolean;
  }>;
  /** Voice from the car microphone needs OpenAI or Gemini transcription. */
  voiceAvailable: boolean;
};

export const getAssistantModels = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/assistant/models`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
