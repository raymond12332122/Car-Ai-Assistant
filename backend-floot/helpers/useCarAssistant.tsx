import { useCallback, useEffect, useRef, useState } from "react";
import {
  postAssistantChat,
  type ChatMessage,
  type GeoLocation,
  type OutputType,
} from "../endpoints/assistant/chat_POST.schema";
import { postAssistantVoice } from "../endpoints/assistant/voice_POST.schema";
import { navigationLinks } from "./navigationLinks";

const HISTORY_KEY = "copiloto.history.v1";
const MAX_HISTORY = 12;
const MAX_RECORDING_MS = 12000;

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

/** Free in-browser speech recognition (Chrome / Edge / Safari), if present. */
function createRecognition(): BrowserRecognition | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  return Ctor ? (new Ctor() as BrowserRecognition) : null;
}

type NativeBridge = { speak?: (text: string) => void; postMessage?: (msg: string) => void };
declare global {
  interface Window {
    // Injected by the Flutter app's WebView (JavaScriptChannel "CopilotoNative").
    CopilotoNative?: NativeBridge;
  }
}

export type AssistantStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]).slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: ChatMessage[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch {
    /* storage unavailable: history stays in memory */
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Best installed Spanish voice; browsers default to an English voice on some systems. */
function pickVoice(language: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("es"));
  if (!voices.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase().replace("_", "-");
    let s = 0;
    if (lang === language.toLowerCase()) s += 100;
    if (lang === "es-us" || lang === "es-419") s += 60;
    if (/google|natural|neural|online/i.test(v.name)) s += 30;
    return s;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

export function speakText(text: string, language: string, onEnd?: () => void) {
  if (typeof window === "undefined") return;
  if (window.CopilotoNative?.postMessage) {
    window.CopilotoNative.postMessage(JSON.stringify({ type: "speak", text }));
    onEnd?.();
    return;
  }
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = language;
  const voice = pickVoice(language);
  if (voice) u.voice = voice;
  u.rate = 1;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function useCarAssistant(options: {
  language: string;
  voiceEnabled: boolean;
  model: string | null;
}) {
  const [history, setHistory] = useState<ChatMessage[]>(() => loadHistory());
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [last, setLast] = useState<OutputType | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const locationRef = useRef(location);
  locationRef.current = location;

  // Live GPS position (also gives speed while driving).
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speedKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
        }),
      () => setLocation(null),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const handleResult = useCallback((result: OutputType, userText: string) => {
    const next: ChatMessage[] = [
      ...historyRef.current,
      { role: "user" as const, content: userText },
      { role: "assistant" as const, content: result.reply },
    ].slice(-MAX_HISTORY);
    setHistory(next);
    saveHistory(next);
    setLast(result);
    // "Inicia la navegación a…": open turn-by-turn as soon as the reply is spoken.
    const action = result.action;
    const startNavigation = () => {
      if (action.type !== "navigate" || action.lat == null || action.lng == null) return;
      if (window.CopilotoNative?.postMessage) {
        window.CopilotoNative.postMessage(
          JSON.stringify({ type: "navigate", lat: action.lat, lng: action.lng, name: action.destinationName }),
        );
      } else {
        window.open(navigationLinks.googleMaps(action.lat, action.lng), "_blank", "noopener");
      }
    };
    if (optionsRef.current.voiceEnabled && result.speech) {
      setStatus("speaking");
      speakText(result.speech, optionsRef.current.language, () => {
        setStatus("idle");
        startNavigation();
      });
    } else {
      setStatus("idle");
      startNavigation();
    }
  }, []);

  const handleError = useCallback((err: unknown) => {
    const e = err as Error & { code?: string };
    if (e.code === "OUT_OF_CREDITS") {
      console.warn("Floot AI out of credits");
      setError("El asistente no está disponible por ahora.");
    } else {
      setError(e.message || "Algo salió mal.");
    }
    setStatus("error");
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setError(null);
      setTranscript(trimmed);
      setStatus("thinking");
      try {
        const result = await postAssistantChat({
          messages: [
            ...historyRef.current,
            { role: "user" as const, content: trimmed },
          ].slice(-20),
          location: locationRef.current,
          language: optionsRef.current.language,
          surface: "phone",
          model: optionsRef.current.model,
        });
        handleResult(result, trimmed);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, handleResult],
  );

  const sendAudio = useCallback(
    async (blob: Blob) => {
      setStatus("thinking");
      try {
        const mime = (blob.type || "audio/webm").split(";")[0];
        const allowed = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg", "audio/aac"] as const;
        const mimeType = (allowed as readonly string[]).includes(mime)
          ? (mime as (typeof allowed)[number])
          : "audio/webm";
        const result = await postAssistantVoice({
          audioBase64: await blobToBase64(blob),
          mimeType,
          history: historyRef.current.slice(-19),
          location: locationRef.current,
          language: optionsRef.current.language,
          surface: "phone",
          model: optionsRef.current.model,
        });
        setTranscript(result.transcript);
        handleResult(result, result.transcript);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, handleResult],
  );

  const stopListening = useCallback(() => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    recognitionRef.current?.stop();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    // Prefer the browser's own recognizer: free and needs no OpenAI key.
    const recognition = createRecognition();
    if (recognition) {
      let finalText = "";
      recognition.lang = optionsRef.current.language;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      recognition.onresult = (e: any) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        setTranscript(text);
        if (e.results[e.results.length - 1].isFinal) finalText = text;
      };
      recognition.onerror = (e: any) => {
        if (e.error === "not-allowed") setError("Permite el micrófono para hablar con Copiloto.");
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        if (finalText.trim()) void ask(finalText);
        else setStatus((s) => (s === "listening" ? "idle" : s));
      };
      recognitionRef.current = recognition;
      setTranscript(null);
      setStatus("listening");
      recognition.start();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType });
        if (blob.size < 1200) {
          setStatus("idle");
          return;
        }
        void sendAudio(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setTranscript(null);
      setStatus("listening");
      stopTimerRef.current = window.setTimeout(stopListening, MAX_RECORDING_MS);
    } catch {
      setError("Permite el micrófono para hablar con Copiloto.");
      setStatus("error");
    }
  }, [ask, sendAudio, stopListening]);

  const toggleListening = useCallback(() => {
    if (status === "listening") stopListening();
    else if (status !== "thinking") void startListening();
  }, [startListening, status, stopListening]);

  const clear = useCallback(() => {
    setHistory([]);
    saveHistory([]);
    setLast(null);
    setTranscript(null);
    setError(null);
    setStatus("idle");
  }, []);

  return { status, last, transcript, error, location, history, ask, toggleListening, clear };
}
