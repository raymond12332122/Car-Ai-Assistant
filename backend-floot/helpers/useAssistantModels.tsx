import { useQuery } from "@tanstack/react-query";
import { getAssistantModels } from "../endpoints/assistant/models_GET.schema";

/** Models offered by the backend and whether each provider's key is connected. */
export function useAssistantModels() {
  return useQuery({
    queryKey: ["assistant", "models"],
    queryFn: () => getAssistantModels(),
    staleTime: 5 * 60 * 1000,
  });
}
