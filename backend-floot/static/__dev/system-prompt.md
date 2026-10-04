Copiloto — asistente IA por voz para el auto, integrado a Android Auto. Español (es-MX) por defecto.

Arquitectura:
- Floot = backend + UI web. Endpoints públicos (flootPublic) consumidos por la web, la app Flutter y la app de Android Auto (Kotlin, Car App Library) del repo GitHub raymond12332122/Car-Ai-Assistant.
  - POST /_api/assistant/chat {messages, location?, language, surface: car|phone|web} → {reply, speech, action{type none|navigate|show_places|call,...}, places[]}
  - POST /_api/assistant/voice {audioBase64, mimeType, history, location?, ...} → igual + transcript (gemini-3.5-transcribe → chat)
  - Aceptan JSON plano o superjson (helpers/parseRequestBody); responden superjson {"json": ...}.
- IA: SOLO Claude (Anthropic API, ANTHROPIC_API_KEY) y ChatGPT (OpenAI API, OPENAI_API_KEY) con las llaves del dueño — NO usar Floot AI (decisión del usuario). Modelo seleccionable (helpers/assistantModels.tsx; GET /_api/assistant/models dice cuáles tienen llave). Claude: herramienta `respond` estricta para la respuesta final, web_search server tool, effort low + fallbacks default en Opus/Sonnet 5.5. OpenAI: Responses API con json_schema + web_search. Voz del auto: OpenAI gpt-4o-mini-transcribe. Tools search_nearby_places (Overpass) y find_destination (Nominatim). Lógica en helpers/carAssistant.tsx, geo en helpers/geoServices.tsx.
- UI web (pages/_index): modo oscuro "cabina nocturna", botón de micrófono grande (MediaRecorder → /assistant/voice), accesos rápidos, tarjetas de lugares, navegación vía Google Maps/Waze. Bridge opcional window.CopilotoNative.postMessage({type:"speak"}) para TTS dentro del WebView de Flutter.
- Sin base de datos: el historial vive en el cliente (localStorage / SharedPreferences / sesión del auto).

