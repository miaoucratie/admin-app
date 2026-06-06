import ical, { type VEvent } from "node-ical";

const TZ = "Europe/Paris";
const DAY_MS = 24 * 60 * 60 * 1000;

type ICalData = Awaited<ReturnType<typeof ical.async.parseICS>>;

export interface CalendarEvent {
  id: string;
  summary: string;
  /** ISO instant for timed events; YYYY-MM-DD for all-day events. */
  start: string;
  end: string;
  /** Europe/Paris HH:MM labels for timed events (omitted for all-day). */
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  location?: string;
  description?: string;
}

/** node-ical types some text fields as either a string or { val }. Normalise. */
function asText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const s = value.trim();
    return s || undefined;
  }
  if (typeof value === "object" && "val" in (value as Record<string, unknown>)) {
    const s = String((value as { val: unknown }).val ?? "").trim();
    return s || undefined;
  }
  return undefined;
}

/** Offset of a timezone at a given instant, in milliseconds (UTC + offset = local). */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - instant.getTime();
}

/** The real instant when wall-clock {y,mo,d,h,mi,s} occurs in tz. */
function instantFromWallClock(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off = tzOffsetMs(new Date(guess), tz);
  return new Date(guess - off);
}

/** YYYY-MM-DD for "today" in the calendar timezone. */
export function todayInParis(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDayStr(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Instant of midnight (start of day) for dateStr in the calendar timezone. */
function parisMidnight(dateStr: string): Date {
  const baseUTC = new Date(`${dateStr}T00:00:00Z`);
  const off = tzOffsetMs(baseUTC, TZ);
  return new Date(baseUTC.getTime() - off);
}

/** Calendar date (YYYY-MM-DD) of an all-day VEVENT date (stored at UTC midnight). */
function allDayDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** HH:MM of an instant in the calendar timezone. */
function parisHM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** YYYY-MM-DD of an instant in the calendar timezone (en-CA emits ISO order). */
function parisDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

interface Instance {
  start: Date;
  end: Date;
}

// Calendar owner. Events organised by anyone else (third-party invitations,
// auto-created bookings, etc.) are private: their title/location/description are
// redacted to "Vacances" or "Indisponibilité" and never leave the server.
const OWNER_EMAIL = "miaoucratie@gmail.com";
const VACANCES_RE = /vacances|cong[ée]|holiday|vacation/i;

function organizerEmail(event: VEvent): string | null {
  const org = (event as { organizer?: unknown }).organizer;
  if (!org) return null;
  const raw =
    typeof org === "string" ? org : ((org as { val?: string }).val ?? "");
  const m = String(raw).match(/mailto:(.+)/i);
  const email = (m ? m[1] : String(raw)).trim().toLowerCase();
  return email || null;
}

/** True when the event was created by the calendar owner (or has no organizer). */
function isOwnerEvent(event: VEvent): boolean {
  const email = organizerEmail(event);
  return !email || email === OWNER_EMAIL;
}

/** Label shown for a third-party event in place of its real title. */
function redactedLabel(originalSummary: string | undefined): string {
  return VACANCES_RE.test(originalSummary ?? "") ? "Vacances" : "Indisponibilité";
}

function pushIfOverlaps(
  out: CalendarEvent[],
  base: VEvent,
  inst: Instance,
  dayStart: Date,
  dayEnd: Date,
  idSuffix: string,
  owned: boolean,
): void {
  if (inst.start < dayEnd && inst.end > dayStart) {
    const summary = asText(base.summary) || "(Sans titre)";
    out.push({
      id: `${String(base.uid ?? "evt")}${idSuffix}`,
      summary: owned ? summary : redactedLabel(summary),
      start: inst.start.toISOString(),
      end: inst.end.toISOString(),
      startTime: parisHM(inst.start),
      endTime: parisHM(inst.end),
      allDay: false,
      location: owned ? asText(base.location) : undefined,
      description: owned ? asText(base.description) : undefined,
    });
  }
}

/**
 * Fetch the Miaoucratie iCal feed and return events occurring on the given day
 * (YYYY-MM-DD, Europe/Paris). Handles all-day, multi-day and recurring events.
 */
export async function getEventsForDay(
  icalUrl: string,
  dateStr: string,
): Promise<CalendarEvent[]> {
  if (!isValidDateStr(dateStr)) {
    throw new Error("INVALID_DATE");
  }

  const res = await fetch(icalUrl, {
    headers: { Accept: "text/calendar" },
  });
  if (!res.ok) {
    throw new Error(`ICAL_FETCH_FAILED_${res.status}`);
  }
  const body = await res.text();
  const data: ICalData = await ical.async.parseICS(body);

  const dayStart = parisMidnight(dateStr);
  const dayEnd = parisMidnight(addDayStr(dateStr));
  const out: CalendarEvent[] = [];

  for (const key of Object.keys(data)) {
    const comp = data[key];
    if (!comp || comp.type !== "VEVENT") continue;
    const event = comp as VEvent;
    if (!event.start || !event.end) continue;

    const owned = isOwnerEvent(event);
    const isAllDay = event.datetype === "date";

    // All-day events: compare by calendar date strings.
    if (isAllDay) {
      const spanDays = Math.max(
        1,
        Math.round((event.end.getTime() - event.start.getTime()) / DAY_MS),
      );

      // Recurring all-day events (e.g. multi-day cat sittings modelled as a
      // DAILY recurrence). Expand occurrences around the requested day.
      if (event.rrule) {
        const exdates = new Set<string>(
          Object.values(event.exdate ?? {})
            .filter((d): d is Date => d instanceof Date)
            .map(allDayDateStr),
        );
        const overridesByKey = new Map<string, VEvent>();
        for (const ov of Object.values(event.recurrences ?? {}) as VEvent[]) {
          if (ov.recurrenceid instanceof Date)
            overridesByKey.set(allDayDateStr(ov.recurrenceid), ov);
        }
        const targetUTC = new Date(`${dateStr}T00:00:00Z`);
        const winStart = new Date(targetUTC.getTime() - spanDays * DAY_MS);
        const winEnd = new Date(targetUTC.getTime() + DAY_MS);
        for (const occ of event.rrule.between(winStart, winEnd, true)) {
          const occKey = allDayDateStr(occ);
          if (exdates.has(occKey)) continue;
          const ov = overridesByKey.get(occKey);
          const src = ov ?? event;
          const startStr = ov?.start ? allDayDateStr(ov.start) : occKey;
          const endStr = ov?.end
            ? allDayDateStr(ov.end)
            : allDayDateStr(new Date(occ.getTime() + spanDays * DAY_MS));
          if (dateStr >= startStr && dateStr < endStr) {
            const summary = asText(src.summary) || "(Sans titre)";
            out.push({
              id: `${String(event.uid ?? key)}-${occKey}`,
              summary: owned ? summary : redactedLabel(summary),
              start: startStr,
              end: endStr,
              allDay: true,
              location: owned ? asText(src.location) : undefined,
              description: owned ? asText(src.description) : undefined,
            });
          }
        }
        continue;
      }

      // Single (possibly multi-day) all-day event.
      const startStr = allDayDateStr(event.start);
      const endStr = allDayDateStr(event.end); // exclusive
      if (dateStr >= startStr && dateStr < endStr) {
        const summary = asText(event.summary) || "(Sans titre)";
        out.push({
          id: String(event.uid ?? key),
          summary: owned ? summary : redactedLabel(summary),
          start: startStr,
          end: endStr,
          allDay: true,
          location: owned ? asText(event.location) : undefined,
          description: owned ? asText(event.description) : undefined,
        });
      }
      continue;
    }

    const durationMs = event.end.getTime() - event.start.getTime();

    // Recurring timed events.
    if (event.rrule) {
      const tz = event.start.tz || TZ;
      // Widen the search window by the event duration so multi-hour events
      // starting just before the day are still caught.
      const windowStart = new Date(dayStart.getTime() - durationMs);
      const occurrences = event.rrule.between(windowStart, dayEnd, true);

      const exdates = new Set<string>(
        Object.values(event.exdate ?? {})
          .filter((d): d is Date => d instanceof Date)
          .map(parisDateKey),
      );
      const overridesByKey = new Map<string, VEvent>();
      for (const ov of Object.values(event.recurrences ?? {}) as VEvent[]) {
        if (ov.recurrenceid instanceof Date)
          overridesByKey.set(parisDateKey(ov.recurrenceid), ov);
      }

      for (const occ of occurrences) {
        // rrule returns floating wall-clock in UTC fields; reinterpret in tz.
        const occStart = instantFromWallClock(
          occ.getUTCFullYear(),
          occ.getUTCMonth() + 1,
          occ.getUTCDate(),
          occ.getUTCHours(),
          occ.getUTCMinutes(),
          occ.getUTCSeconds(),
          tz,
        );
        const occDateKey = parisDateKey(occStart);
        if (exdates.has(occDateKey)) continue;

        const override = overridesByKey.get(occDateKey);
        if (override && override.start && override.end) {
          pushIfOverlaps(
            out,
            override,
            { start: override.start, end: override.end },
            dayStart,
            dayEnd,
            `-${occDateKey}`,
            owned,
          );
          continue;
        }

        pushIfOverlaps(
          out,
          event,
          { start: occStart, end: new Date(occStart.getTime() + durationMs) },
          dayStart,
          dayEnd,
          `-${occDateKey}`,
          owned,
        );
      }
      continue;
    }

    // Single timed event.
    pushIfOverlaps(
      out,
      event,
      { start: event.start, end: event.end },
      dayStart,
      dayEnd,
      "",
      owned,
    );
  }

  out.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.localeCompare(b.start);
  });

  return out;
}
