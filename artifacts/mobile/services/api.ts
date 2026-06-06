function resolveApiBase(): string {
  // Static web build hosted on miaoucratie.fr: talk to the reservation API
  // directly. Same-origin requests carry Origin: https://miaoucratie.fr, which
  // the API allows, so no relay is needed.
  const direct = process.env.EXPO_PUBLIC_API_BASE;
  if (direct) {
    return direct.replace(/\/+$/, "");
  }
  // Replit-hosted build: go through the api-server relay that injects the
  // allowed Origin header server-side.
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    const host = domain.replace(/^https?:\/\//, "");
    return `https://${host}/api/miaou`;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/miaou`;
  }
  return "/api/miaou";
}

// The Google Calendar feed is only available through the api-server relay
// (it holds the private iCal secret). Unlike the reservation API, it must never
// hit the upstream Workers API directly, so it has its own base resolver.
function resolveRelayBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    const host = domain.replace(/^https?:\/\//, "");
    return `https://${host}/api/miaou`;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/miaou`;
  }
  return "/api/miaou";
}

const API_BASE = resolveApiBase();
const RELAY_BASE = resolveRelayBase();

export interface Period {
  id: number;
  startDate: string;
  endDate: string;
  comment?: string;
}

export interface PeriodPayload {
  startDate: string;
  endDate: string;
  comment?: string;
}

export async function login(password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok || !data?.token) {
    throw new Error(data?.message || "Connexion impossible. Vérifiez votre mot de passe.");
  }
  return data.token as string;
}

export async function fetchPeriods(token: string): Promise<Period[]> {
  const res = await fetch(`${API_BASE}/unavailabilities`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Chargement impossible.");
  return Array.isArray(data?.ranges) ? data.ranges : [];
}

export async function createPeriod(
  token: string,
  payload: PeriodPayload
): Promise<Period> {
  const res = await fetch(`${API_BASE}/unavailabilities`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Enregistrement impossible.");
  return data as Period;
}

export async function updatePeriod(
  token: string,
  id: number,
  payload: PeriodPayload
): Promise<Period> {
  const res = await fetch(`${API_BASE}/unavailabilities/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Mise à jour impossible.");
  return data as Period;
}

export async function deletePeriod(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/unavailabilities/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Suppression impossible.");
  }
}

export function formatDateFr(isoDate: string): string {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export interface DayEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  location?: string;
  description?: string;
}

export interface DayAgenda {
  date: string;
  events: DayEvent[];
}

export async function fetchDayEvents(
  token: string,
  date?: string
): Promise<DayAgenda> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await fetch(`${RELAY_BASE}/calendar${qs}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Chargement de l'agenda impossible.");
  return {
    date: typeof data?.date === "string" ? data.date : date ?? "",
    events: Array.isArray(data?.events) ? data.events : [],
  };
}

const WEEKDAYS_FR = [
  "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
];
const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** "Samedi 6 juin 2026" from a YYYY-MM-DD string (no timezone math needed). */
export function formatLongDateFr(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = WEEKDAYS_FR[new Date(y, m - 1, d).getDay()];
  return `${weekday} ${d} ${MONTHS_FR[m - 1]} ${y}`;
}
