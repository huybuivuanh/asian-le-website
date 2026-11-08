import { bizDoc } from "@/lib/business";
import { cache } from "react";
import { getDoc, Timestamp } from "firebase/firestore";
import { INDEFINITE_PAUSE } from "@/lib/availability";

/**
 * Server-side fetchers for settings/store, per ecommerce.md.
 * See lib/availability.ts for the open/closed decision logic.
 */

const DEFAULT_DAY_HOURS: DayHours = { isOpen: false, open: "00:00", close: "00:00" };

// Store is in Prince Albert, SK, which doesn't observe DST (America/Regina, CST year-round).
// Only used if settings/store is missing or malformed — StoreSettings.timezone is authoritative.
const DEFAULT_TIMEZONE = "America/Regina";

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  pausedUntil: INDEFINITE_PAUSE,
  timezone: DEFAULT_TIMEZONE,
  waitTime: 0,
  restaurantPhoneNumber: "",
  hours: {
    mon: DEFAULT_DAY_HOURS,
    tue: DEFAULT_DAY_HOURS,
    wed: DEFAULT_DAY_HOURS,
    thu: DEFAULT_DAY_HOURS,
    fri: DEFAULT_DAY_HOURS,
    sat: DEFAULT_DAY_HOURS,
    sun: DEFAULT_DAY_HOURS,
  },
  reservationHours: {
    mon: DEFAULT_DAY_HOURS,
    tue: DEFAULT_DAY_HOURS,
    wed: DEFAULT_DAY_HOURS,
    thu: DEFAULT_DAY_HOURS,
    fri: DEFAULT_DAY_HOURS,
    sat: DEFAULT_DAY_HOURS,
    sun: DEFAULT_DAY_HOURS,
  },
  holidays: [],
};

function mapDayHours(raw: unknown): DayHours {
  if (!raw || typeof raw !== "object") return DEFAULT_DAY_HOURS;
  const r = raw as { isOpen?: unknown; open?: unknown; close?: unknown };
  return {
    isOpen: r.isOpen === true,
    open: typeof r.open === "string" ? r.open : DEFAULT_DAY_HOURS.open,
    close: typeof r.close === "string" ? r.close : DEFAULT_DAY_HOURS.close,
  };
}

export function mapWeeklyHours(raw: unknown): WeeklyHours {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    mon: mapDayHours(r.mon),
    tue: mapDayHours(r.tue),
    wed: mapDayHours(r.wed),
    thu: mapDayHours(r.thu),
    fri: mapDayHours(r.fri),
    sat: mapDayHours(r.sat),
    sun: mapDayHours(r.sun),
  };
}

export function mapHolidays(raw: unknown): Holiday[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): Holiday | null => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as { id?: unknown; from?: unknown; to?: unknown };
      if (typeof e.id !== "string" || typeof e.from !== "string") return null;
      return { id: e.id, from: e.from, to: typeof e.to === "string" ? e.to : undefined };
    })
    .filter((v): v is Holiday => v !== null);
}

/** Maps a raw settings/store Firestore doc into StoreSettings, falling back to `fallback`
 * for missing/malformed scalar fields. Shared by the SSR fetch below (getDoc) and the
 * client-side live subscriptions in useLiveStoreSettings (onSnapshot) — same doc shape
 * either way, just a different read API. */
export function mapStoreSettingsDoc(
  d: Record<string, unknown> | undefined,
  fallback: StoreSettings = DEFAULT_STORE_SETTINGS,
): StoreSettings {
  if (!d) return fallback;
  return {
    pausedUntil:
      d.pausedUntil === null
        ? null
        : d.pausedUntil instanceof Timestamp
          ? d.pausedUntil.toDate()
          : INDEFINITE_PAUSE,
    timezone: typeof d.timezone === "string" ? d.timezone : fallback.timezone,
    waitTime: typeof d.waitTime === "number" ? d.waitTime : fallback.waitTime,
    restaurantPhoneNumber:
      typeof d.restaurantPhoneNumber === "string"
        ? d.restaurantPhoneNumber
        : fallback.restaurantPhoneNumber,
    hours: mapWeeklyHours(d.hours),
    reservationHours: mapWeeklyHours(d.reservationHours),
    holidays: mapHolidays(d.holidays),
  };
}

export async function fetchStoreSettingsForServer(): Promise<StoreSettings> {
  const snapshot = await getDoc(bizDoc("settings", "store"));
  return mapStoreSettingsDoc(snapshot.exists() ? snapshot.data() : undefined);
}

/** Deduped per request when referenced from multiple server components. */
export const getStoreSettings = cache(fetchStoreSettingsForServer);
