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

export const geoServices = {
  categories: Object.keys(PLACE_CATEGORIES) as PlaceCategory[],
  searchNearby,
  geocode,
  reverseGeocode,
};
