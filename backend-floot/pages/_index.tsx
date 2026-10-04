import { useEffect, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet";
import {
  Fuel,
  Zap,
  UtensilsCrossed,
  ParkingCircle,
  Wrench,
  Cross,
  CloudSun,
  Mic,
  Square,
  Send,
  Navigation,
  Volume2,
  VolumeX,
  RotateCcw,
  MapPin,
  MapPinOff,
} from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Spinner } from "../components/Spinner";
import { PlaceCard } from "../components/PlaceCard";
import { switchToDarkMode } from "../helpers/themeMode";
import { useCarAssistant } from "../helpers/useCarAssistant";
import { navigationLinks } from "../helpers/navigationLinks";
import styles from "./_index.module.css";

const LANGUAGE = "es-MX";

const QUICK_ACTIONS = [
  { label: "Gasolina", icon: Fuel, prompt: "Busca la gasolinera más cercana" },
  { label: "Cargador", icon: Zap, prompt: "Busca un cargador para auto eléctrico cerca" },
  { label: "Comida", icon: UtensilsCrossed, prompt: "¿Dónde puedo comer cerca?" },
  { label: "Estacionar", icon: ParkingCircle, prompt: "Busca estacionamiento cerca" },
  { label: "Taller", icon: Wrench, prompt: "Busca un taller mecánico cercano" },
  { label: "Hospital", icon: Cross, prompt: "¿Cuál es el hospital más cercano?" },
  { label: "Clima", icon: CloudSun, prompt: "¿Cómo está el clima aquí hoy?" },
];

const STATUS_LABEL = {
  idle: "Toca el micrófono y habla",
  listening: "Escuchando… toca para terminar",
  thinking: "Pensando…",
  speaking: "Respondiendo",
  error: "Hubo un problema",
} as const;

export default function CarAssistantPage() {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [text, setText] = useState("");
  const { status, last, transcript, error, location, ask, toggleListening, clear } =
    useCarAssistant({ language: LANGUAGE, voiceEnabled });

  useEffect(() => {
    switchToDarkMode();
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || status === "thinking") return;
    void ask(text);
    setText("");
  };

  const nav = last?.action.type === "navigate" && last.action.lat != null && last.action.lng != null
    ? last.action
    : null;
  const busy = status === "thinking";

  return (
    <div className={styles.screen}>
      <Helmet>
        <title>Copiloto · Asistente IA para tu auto</title>
        <meta name="description" content="Asistente de IA por voz para manejar: lugares cercanos, navegación, clima y más." />
        <meta name="theme-color" content="#0b0f16" />
      </Helmet>

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logoDot} aria-hidden />
          <span className={styles.brandName}>Copiloto</span>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.gps} ${location ? styles.gpsOn : ""}`}>
            {location ? <MapPin size={18} /> : <MapPinOff size={18} />}
            {location
              ? location.speedKmh != null && location.speedKmh > 3
                ? `${Math.round(location.speedKmh)} km/h`
                : "GPS"
              : "Sin GPS"}
          </span>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={voiceEnabled ? "Silenciar voz" : "Activar voz"}
            onClick={() => setVoiceEnabled((v) => !v)}
          >
            {voiceEnabled ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button variant="ghost" size="icon-lg" aria-label="Nueva conversación" onClick={clear}>
            <RotateCcw />
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.conversation} aria-live="polite">
          <p className={`${styles.status} ${styles[`status_${status}`]}`}>
            {busy && <Spinner size="sm" />} {STATUS_LABEL[status]}
          </p>
          {transcript && <p className={styles.transcript}>“{transcript}”</p>}
          {error ? (
            <p className={styles.error}>{error}</p>
          ) : last ? (
            <p className={styles.reply}>{last.reply}</p>
          ) : (
            <p className={styles.hello}>
              ¿A dónde vamos hoy? <span>Pregúntame por gasolineras, comida, clima o dime “llévame a…”.</span>
            </p>
          )}

          {nav && (
            <div className={styles.navCard}>
              <div>
                <p className={styles.navLabel}>Destino</p>
                <p className={styles.navName}>{nav.destinationName}</p>
                {nav.address && <p className={styles.navAddress}>{nav.address}</p>}
              </div>
              <div className={styles.navButtons}>
                <Button
                  size="lg"
                  className={styles.navGo}
                  onClick={() => window.open(navigationLinks.googleMaps(nav.lat!, nav.lng!), "_blank", "noopener")}
                >
                  <Navigation /> Iniciar navegación
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => window.open(navigationLinks.waze(nav.lat!, nav.lng!), "_blank", "noopener")}
                >
                  Waze
                </Button>
              </div>
            </div>
          )}
        </section>

        {last && last.places.length > 0 && !nav && (
          <section className={styles.places} aria-label="Lugares encontrados">
            {last.places.map((p, i) => (
              <PlaceCard key={p.id} place={p} highlighted={i === 0} />
            ))}
          </section>
        )}

        <section className={styles.quick} aria-label="Accesos rápidos">
          {QUICK_ACTIONS.map(({ label, icon: Icon, prompt }) => (
            <button
              key={label}
              type="button"
              className={styles.quickButton}
              disabled={busy}
              onClick={() => void ask(prompt)}
            >
              <Icon size={26} />
              <span>{label}</span>
            </button>
          ))}
        </section>
      </main>

      <footer className={styles.dock}>
        <form className={styles.textForm} onSubmit={onSubmit}>
          <Input
            className={styles.textInput}
            placeholder="Escribe (solo estacionado)…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Mensaje"
          />
          <Button type="submit" size="icon-lg" variant="secondary" disabled={busy || !text.trim()} aria-label="Enviar">
            <Send />
          </Button>
        </form>
        <button
          type="button"
          className={`${styles.mic} ${status === "listening" ? styles.micListening : ""}`}
          onClick={toggleListening}
          disabled={busy}
          aria-label={status === "listening" ? "Terminar de hablar" : "Hablar con Copiloto"}
        >
          {busy ? <Spinner size="lg" /> : status === "listening" ? <Square size={40} /> : <Mic size={44} />}
        </button>
      </footer>
    </div>
  );
}
