import superjson from "superjson";
import type { OutputType } from "./models_GET.schema";
import { assistantModels } from "../../helpers/assistantModels";
import { carAssistant } from "../../helpers/carAssistant";

export const flootPublic = true;

export async function handle(_request: Request) {
  const configured = carAssistant.configuredProviders();
  const models = assistantModels.list.map((m) => ({
    id: m.id,
    provider: m.provider,
    label: m.label,
    note: m.note,
    available: configured[m.provider],
  }));
  const preferred = models.find((m) => m.id === assistantModels.defaultModel && m.available);
  const body: OutputType = {
    defaultModel: preferred?.id ?? models.find((m) => m.available)?.id ?? null,
    models,
    voiceAvailable: configured.openai,
  };
  return new Response(superjson.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
