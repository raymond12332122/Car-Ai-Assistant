import superjson from "superjson";
import { schema, OutputType } from "./chat_POST.schema";
import { parseRequestBody } from "../../helpers/parseRequestBody";
import { carAssistant } from "../../helpers/carAssistant";
import { aiErrorResponse } from "../../helpers/aiErrorResponse";

// Called by the native Android / Android Auto app as well as the web UI.
export const flootPublic = true;

export async function handle(request: Request) {
  try {
    const input = schema.parse(await parseRequestBody(request));
    const result = await carAssistant.run(input);
    return new Response(superjson.stringify(result satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
