# Copiloto — Asistente IA para tu auto (Android Auto)

Asistente de IA por voz pensado para manejar: busca gasolineras, cargadores, comida,
estacionamiento, talleres u hospitales cerca de ti, te lleva a un destino ("llévame a…"),
y responde clima, tráfico o cualquier pregunta — todo con respuestas cortas habladas.

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| **Backend + UI web** | [Floot](https://copiloto-car-ai.floot.app) (código espejo en `backend-floot/`) | Endpoints serverless de IA, búsqueda de lugares y la interfaz web que carga el WebView. Hosting gratis en Floot. |
| **App del teléfono** | `lib/` (Flutter) | UI nativa con voz (reconocimiento y TTS del teléfono), GPS, tarjetas de lugares y una pestaña con la UI web en WebView. |
| **Android Auto** | `android/app/src/main/kotlin/.../car/` (Kotlin, Car App Library) | Pantallas en la pantalla del auto: cuadrícula de accesos rápidos, botón **Hablar** con el micrófono del auto, mapa con lugares y envío a Google Maps/Waze. |

> Flutter no puede dibujar en la pantalla de Android Auto (Google solo permite plantillas
> nativas de la *Car App Library*). Por eso la parte del auto está en Kotlin dentro del
> mismo APK, y comparte el mismo backend.

## Arquitectura

```
 Teléfono (Flutter) ─┐
 Android Auto (Kotlin)├──► https://copiloto-car-ai.floot.app/_api/assistant/chat   (texto)
 UI web / WebView ────┘                                   /_api/assistant/voice  (audio WAV/WebM)
                                │
                                ├─ Gemini (Google AI Studio, GRATIS)   ─┐
                                ├─ Claude (API de Anthropic, tu llave)  ├ modelo seleccionable
                                ├─ ChatGPT (API de OpenAI, tu llave)    ─┘
                                ├─ Voz del auto → texto: Gemini Flash Lite (u OpenAI si hay llave)
                                ├─ Open-Meteo (clima, gratis, sin llave)
                                ├─ OpenStreetMap Overpass  (lugares cercanos, gratis, sin llave)
                                └─ OpenStreetMap Nominatim (direcciones / destinos)
```

### API

`POST /_api/assistant/chat`

```json
{
  "messages": [{ "role": "user", "content": "Necesito gasolina" }],
  "location": { "lat": 19.4326, "lng": -99.1332, "speedKmh": 40 },
  "language": "es-MX",
  "surface": "car"
}
```

Respuesta (formato superjson, el contenido está en `json`):

```json
{ "json": {
  "reply": "La Pemex más cercana está en Calle Simón Bolívar, a 882 metros.",
  "speech": "Pemex a unos 880 metros.",
  "action": { "type": "show_places", "destinationName": null, "lat": null, "lng": null, "address": null, "phone": null },
  "places": [{ "id": "node/6579275785", "name": "Pemex", "lat": 19.427, "lng": -99.139, "distanceMeters": 882, "address": "Calle Simón Bolívar", "phone": null, "openingHours": null, "category": "fuel" }]
}}
```

Campo opcional `"model"`: `gemini-flash-lite-latest` (predeterminado, gratis), `gemini-3.8-flash`,
`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-4-5`, `gpt-6-luna` o `gpt-6.1-sol`. `GET /_api/assistant/models` lista los modelos y cuáles tienen llave conectada.

`action.type` puede ser `none`, `navigate` (con `lat`/`lng` del destino), `show_places` o `call`.

`POST /_api/assistant/voice` recibe `{ audioBase64, mimeType: "audio/wav" | "audio/webm" | …, history, location, language, surface }`
y devuelve lo mismo más `transcript`.

## Instalar en tu teléfono

1. Descarga el APK desde **GitHub → Actions → "Android APK" → artefacto `copiloto-apk`**
   (o compílalo, ver abajo) e instálalo (permite "instalar apps desconocidas").
2. Abre Copiloto una vez y acepta **micrófono** y **ubicación**.

### Activar en Android Auto (app no publicada en Play Store)

1. En el teléfono abre **Ajustes de Android Auto** (Ajustes → Dispositivos conectados → Android Auto).
2. Toca **Versión** varias veces hasta que aparezca *"Modo de desarrollador activado"*.
3. Menú ⋮ → **Configuración para desarrolladores** → activa **Fuentes desconocidas**.
4. Conecta el auto: Copiloto aparece en el lanzador de apps de Android Auto.

Para probar sin auto: instala el [Desktop Head Unit (DHU)](https://developer.android.com/training/cars/testing/dhu)
desde el SDK Manager y en Android Auto → ⋮ → *Iniciar servidor de unidad principal*.

> El botón **Hablar** en el auto usa el micrófono del vehículo (`CarAudioRecord`), que requiere
> Android Auto con Car API 5 o superior. En versiones anteriores funcionan los accesos rápidos.

## Compilar

Requisitos: Flutter 3.47+ (Dart 3.13), JDK 21, Android SDK 36/37.

```bash
flutter pub get
flutter test
flutter build apk --release --split-per-abi --target-platform android-arm64
# APK: build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
```

Usar otro backend:

```bash
flutter build apk --dart-define=BACKEND_URL=https://tu-app.floot.app -PbackendUrl=https://tu-app.floot.app
```

(`--dart-define` para la app Flutter, `-PbackendUrl` para la parte de Android Auto.)

## Backend en Floot

El proyecto Floot **"AI Car Assistant"** es la fuente de verdad del backend y la UI web;
`backend-floot/` es una copia de referencia para versionarlo en GitHub. Para cambiarlo,
edítalo en Floot y vuelve a publicar.

- `helpers/carAssistant.tsx` — prompt, herramientas y ciclo de llamadas a la IA.
- `helpers/geoServices.tsx` — búsqueda de lugares (Overpass) y geocodificación (Nominatim).
- `endpoints/assistant/*` — endpoints públicos `chat` y `voice`.
- `pages/_index.tsx` — UI web (modo oscuro, micrófono grande, accesos rápidos).

### Llaves de API

La IA usa **tus propias llaves**, conectadas en Floot (nunca en el código):

- `GEMINI_API_KEY` — **gratis**, https://aistudio.google.com/apikey (sin tarjeta). Es el modelo principal.
- `ANTHROPIC_API_KEY` — https://console.anthropic.com → API Keys
- `OPENAI_API_KEY` — https://platform.openai.com/api-keys (también se usa para transcribir la voz del auto)

> Importante: la suscripción de Claude (Pro/Max) y la de ChatGPT (Plus) **no incluyen la API**.
> La API se paga aparte, por uso, con saldo en cada consola. Para gastar lo menos posible elige
> **Claude Haiku 4.5** o **GPT-6 Luna** en el selector de modelo; cada pregunta cuesta fracciones de centavo
> (más si usa búsqueda web).

**Límites del plan gratis de Gemini** (medidos en octubre 2026):

- Gemini 3.8 Flash: solo **20 llamadas al día**; cada pregunta usa 2–3. Si se agota, Copiloto
  cambia solo a Flash Lite.
- Gemini Flash Lite: límite mucho más alto; es el predeterminado para chat y voz.
- La búsqueda en Google (noticias, deportes) **no** está incluida en el plan gratis: Copiloto dice
  que no puede consultarlo en vez de inventar. Lugares, navegación, clima y voz sí funcionan gratis.

El modelo se elige en la app (chip arriba a la derecha), en la web (selector "Modelo") o en Android Auto
(botón **Modelo**). Teléfono y auto comparten la misma elección.

## Seguridad al manejar

Las respuestas en el auto son de máximo dos frases y se leen en voz alta; no hay teclado en
Android Auto. Escribir solo está disponible en el teléfono, estacionado.

## Pendientes / ideas

- Publicar en Play Store: Google revisa las apps de Android Auto por categoría (esta usa
  **POI / puntos de interés**); funciones de chat libre podrían requerir ajustes para aprobarse.
- Proteger los endpoints con una llave de app o límites por dispositivo antes de compartir el APK
  públicamente (hoy cualquiera con la URL puede gastar tu cuota de IA).
