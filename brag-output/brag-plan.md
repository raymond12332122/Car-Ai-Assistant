# /brag plan — Copiloto

## Rubric
1. **What is it?** Copiloto: a Spanish-language voice AI assistant for driving. Flutter phone app + native Android Auto screens (Kotlin Car App Library) + Floot serverless backend.
2. **Who's it for?** Drivers (es-MX) who need gas, a charger, food, parking, a mechanic, a hospital, the weather, or a destination without touching the phone.
3. **Core promise:** You talk, it finds and routes. Short spoken answers ("Pemex a unos 880 metros").
4. **Best real copy:** "¿A dónde vamos hoy?", "Necesito gasolina", "La Pemex más cercana está en Calle Simón Bolívar, a 882 metros.", "Escuchando… toca para terminar", "Iniciar navegación", "Escribe (solo estacionado)…", quick actions Gasolina / Cargador / Comida / Estacionar / Taller / Hospital / Clima.
5. **Signature visual:** "Night cockpit instrument": graphite #0B0F16, a single luminous cyan #2EE6F6 signal for the mic, amber #FFB224 for warnings. Bricolage Grotesque display + Inter Tight body.
6. **Surprising detail:** Runs free by default (Gemini Flash Lite + Open-Meteo + OpenStreetMap). Claude and ChatGPT are selectable brains with your own key. It also runs on the car's own screen through Android Auto.
7. **Funny angle:** The app's own rule: typing is "solo estacionado" (only when parked). The rest of the time you just talk. Payoff line: "Tú maneja."
8. **Tone:** default, pushed toward cinematic night-drive. Calm and confident like the design principles ("slow, calm pulses"), with snappy cuts on the beat.
9. **Format:** landscape 1920×1080, about 23.5s, Spanish on-screen copy, music + SFX, no voice.

## Creative angle
A night drive. The low-fuel light comes on at 100 km/h, you say one sentence, and Copiloto does the rest. Every scene uses the product's real UI language: mic orb, transcript, reply, place card, Android Auto grid, navigation card.

## Storyboard (120 BPM, beat = 0.5s, cuts land on beats)
| # | Time | Scene | On-screen | Motion / transition | SFX |
|---|---|---|---|---|---|
| 1 Hook | 0.0–3.0 | Dark dash. Speed readout counts to **100 km/h**, then an amber fuel light blinks | "Vas a 100 km/h." → "…y la gasolina en reserva." | Count-up, amber pulse, push-in | riser |
| 2 Reveal | 3.0–6.0 | Cyan dot ignites → **Copiloto** wordmark | "Copiloto" / "Asistente IA para tu auto. Solo háblale." | Dot scales into glow, wordmark slides up | impact on 3.0 (beat drops) |
| 3 Voice → places | 6.0–10.5 | Phone UI: mic orb pulsing, "ESCUCHANDO…", transcript "“Necesito gasolina”", reply + Pemex place card 882 m | Real reply copy | Orb pulse rings, type-on transcript, card rises | click, ping |
| 4 Android Auto | 10.5–14.0 | Car-screen grid of 7 quick actions + Hablar | "También en la pantalla de tu auto" | Tiles cascade on beats | pops |
| 5 Llévame a… | 14.0–17.5 | Transcript "“Llévame al Ángel de la Independencia”" → Destino card with **Iniciar navegación** + Waze | "Google Maps o Waze, con un toque." | Card slides, cyan button glow | whoosh, chime |
| 6 Brains | 17.5–20.5 | Model chips: Gemini (gratis) / Claude / ChatGPT; ticker "Clima: Open-Meteo · Lugares: OpenStreetMap" | "Gratis por defecto. Tú eliges el cerebro." | Chips flip in, Gemini highlighted | ticks |
| 7 Outro | 20.5–23.5 | Wordmark + "Escribe (solo estacionado)…" crossed → **"Tú maneja."** | URL copiloto-car-ai.floot.app | Placeholder strikes out, punchline slams in, hold | impact, chime |

Total 23.5s.

## Audio
- Music: no bundled track ships with this install, so a short original synthwave bed is synthesized locally (120 BPM, Am–F–C–G). Pads and bass only during the hook, then the kick drops at 3.0s on the reveal. Fades out over the last 1.5s.
- Music cue guidance: bars every 2.0s, so scene cuts at 3.0 / 6.0 / 10.5 / 14.0 / 17.5 / 20.5 all land on beats. The drop at 3.0 lines up with the reveal.
- SFX: bundled Pixabay set (whoosh, impact-bass, pop, ping, chime, riser, click-soft).
