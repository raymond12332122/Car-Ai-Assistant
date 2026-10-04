import type { Place } from "../endpoints/assistant/chat_POST.schema";

// Free, key-less OpenStreetMap services. Both require an identifying
// User-Agent and fair use (no bulk queries).
const USER_AGENT = "AICarAssistant/1.0 (floot.app)";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

export const PLACE_CATEGORIES = {
  fuel: '["amenity"="fuel"]',
  ev_charging: '["amenity"="charging_station"]',
  restaurant: '["amenity"~"^(restaurant|fast_food|food_court)$"]',
  cafe: '["amenity"="cafe"]',
  parking: '["amenity"="parking"]',
  hospital: '["amenity"~"^(hospital|clinic)$"]',
  pharmacy: '["amenity"="pharmacy"]',
  atm: '["amenity"~"^(atm|bank)$"]',
  supermarket: '["shop"~"^(supermarket|convenience)$"]',
  car_repair: '["shop"~"^(car_repair|tyres|car_parts)$"]',
  car_wash: '["amenity"="car_wash"]',
  hotel: '["tourism"~"^(hotel|motel|guest_house)$"]',
  toilets: '["amenity"="toilets"]',
  police: '["amenity"="police"]',
} as const;

export type PlaceCategory = keyof typeof PLACE_CATEGORIES;

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function escapeOverpassRegex(value: string) {
  return value.replace(/[\\"^$.*+?()[\]{}|]/g, "\\$&");
}

function addressFromTags(tags: Record<string, string>): string | null {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const parts = [street, tags["addr:suburb"], tags["addr:city"]].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

async function searchNearby(params: {
  category: PlaceCategory;
  lat: number;
  lng: number;
  radiusMeters?: number | null;
  keyword?: string | null;
  limit?: number;
}): Promise<Place[]> {
  const radius = Math.min(Math.max(params.radiusMeters ?? 5000, 300), 25000);
  const filter = PLACE_CATEGORIES[params.category];
  const nameFilter = params.keyword?.trim()
    ? `["name"~"${escapeOverpassRegex(params.keyword.trim())}",i]`
    : "";
  const query = `[out:json][timeout:15];nwr${filter}${nameFilter}(around:${radius},${params.lat},${params.lng});out center tags 60;`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Overpass error ${res.status}`);
  const data = (await res.json()) as {
    elements: Array<{
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  const places: Place[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const tags = el.tags ?? {};
    const name = tags.name ?? tags.brand ?? tags.operator;
    if (!name) continue;
    places.push({
      id: `${el.type}/${el.id}`,
      name,
      category: params.category,
      lat,
      lng,
      distanceMeters: haversineMeters(params.lat, params.lng, lat, lng),
      address: addressFromTags(tags),
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      openingHours: tags.opening_hours ?? null,
    });
  }
  places.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  return places.slice(0, params.limit ?? 6);
}

async function geocode(params: {
  query: string;
  near?: { lat: number; lng: number } | null;
  language: string;
}): Promise<Place[]> {
  const url = new URL(`${NOMINATIM_URL}/search`);
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("accept-language", params.language);
  if (params.near) {
    // Bias (not restrict) results to ~50 km around the driver.
    const d = 0.45;
    url.searchParams.set(
      "viewbox",
      `${params.near.lng - d},${params.near.lat + d},${params.near.lng + d},${params.near.lat - d}`,
    );
  }
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
  const data = (await res.json()) as Array<{
    place_id: number;
    lat: string;
    lon: string;
    name?: string;
    display_name: string;
    type?: string;
  }>;
  return data.map((r) => {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    return {
      id: `nominatim/${r.place_id}`,
      name: r.name || r.display_name.split(",")[0],
      category: r.type ?? "place",
      lat,
      lng,
      distanceMeters: params.near
        ? haversineMeters(params.near.lat, params.near.lng, lat, lng)
        : null,
      address: r.display_name,
      phone: null,
      openingHours: null,
    };
  });
}

async function reverseGeocode(params: {
  lat: number;
  lng: number;
  language: string;
}): Promise<string | null> {
  const url = new URL(`${NOMINATIM_URL}/reverse`);
  url.searchParams.set("lat", String(params.lat));
  url.searchParams.set("lon", String(params.lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "14");
  url.searchParams.set("accept-language", params.language);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

// WMO weather interpretation codes (Open-Meteo) → short Spanish description.
const WEATHER_CODES: Record<number, string> = {
  0: "despejado",
  1: "mayormente despejado",
  2: "parcialmente nublado",
  3: "nublado",
  45: "niebla",
  48: "niebla con escarcha",
  51: "llovizna ligera",
  53: "llovizna",
  55: "llovizna intensa",
  61: "lluvia ligera",
  63: "lluvia",
  65: "lluvia fuerte",
  66: "lluvia helada",
  67: "lluvia helada fuerte",
  71: "nevada ligera",
  73: "nevada",
  75: "nevada fuerte",
  80: "chubascos ligeros",
  81: "chubascos",
  82: "chubascos fuertes",
  95: "tormenta eléctrica",
  96: "tormenta con granizo",
  99: "tormenta fuerte con granizo",
};

/** Current weather + today's forecast from Open-Meteo (free, no API key). */
async function weather(params: { lat: number; lng: number }) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(params.lat));
  url.searchParams.set("longitude", String(params.lng));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "auto");
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
  const d = (await res.json()) as any;
  const day = (i: number) => ({
    condition: WEATHER_CODES[d.daily?.weather_code?.[i]] ?? null,
    maxC: d.daily?.temperature_2m_max?.[i] ?? null,
    minC: d.daily?.temperature_2m_min?.[i] ?? null,
    rainChancePercent: d.daily?.precipitation_probability_max?.[i] ?? null,
  });
  return {
    now: {
      condition: WEATHER_CODES[d.current?.weather_code] ?? null,
      temperatureC: d.current?.temperature_2m ?? null,
      feelsLikeC: d.current?.apparent_temperature ?? null,
      windKmh: d.current?.wind_speed_10m ?? null,
      precipitationMm: d.current?.precipitation ?? null,
    },
    today: day(0),
    tomorrow: day(1),
  };
}

export const geoServices = {
  categories: Object.keys(PLACE_CATEGORIES) as PlaceCategory[],
  searchNearby,
  geocode,
  reverseGeocode,
  weather,
};
