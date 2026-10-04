Copiloto — asistente IA por voz para el auto, integrado a Android Auto. Español (es-MX) por defecto.

Arquitectura:
- Floot = backend + UI web. Endpoints públicos (flootPublic) consumidos por la web, la app Flutter y la app de Android Auto (Kotlin, Car App Library) del repo GitHub raymond12332122/Car-Ai-Assistant.
  - POST /_api/assistant/chat {messages, location?, language, surface: car|phone|web} → {reply, speech, action{type none|navigate|show_places|call,...}, places[]}
  - POST /_api/assistant/voice {audioBase64, mimeType, history, location?, ...} → igual + transcript (gemini-3.5-transcribe → chat)
  - Aceptan JSON plano o superjson (helpers/parseRequestBody); responden superjson {"json": ...}.
- IA: Floot AI gpt-6-luna (rápido, el conductor espera) con web_search hospedado + tools search_nearby_places (OpenStreetMap Overpass) y find_destination (Nominatim). Sin llaves externas. Lógica en helpers/carAssistant.tsx, geo en helpers/geoServices.tsx.
- UI web (pages/_index): modo oscuro "cabina nocturna", botón de micrófono grande (MediaRecorder → /assistant/voice), accesos rápidos, tarjetas de lugares, navegación vía Google Maps/Waze. Bridge opcional window.CopilotoNative.postMessage({type:"speak"}) para TTS dentro del WebView de Flutter.
- Sin base de datos: el historial vive en el cliente (localStorage / SharedPreferences / sesión del auto).

