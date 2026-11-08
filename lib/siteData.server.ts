import { bizCol } from "@/lib/business";
import { cache } from "react";
import { getDocs } from "firebase/firestore";
import { DayOfWeek } from "@/types/enum";

const DAY_VALUES = Object.values(DayOfWeek) as string[];

/**
 * Firestore reads for public site content (updates, gallery, daily specials).
 * Server-only; uses NEXT_PUBLIC Firebase config (works on Vercel/Node).
 */

export async function fetchUpdatesForServer(): Promise<ImageItem[]> {
  const snapshot = await getDocs(bizCol("updates"));
  return snapshot.docs.map((doc) => {
    const d = doc.data();
    const name = typeof d.name === "string" ? d.name : "";
    const url = typeof d.url === "string" ? d.url : "";
    return { id: doc.id, name, url };
  });
}

export async function fetchGalleryForServer(): Promise<ImageItem[]> {
  const snapshot = await getDocs(bizCol("gallery"));
  return snapshot.docs.map((doc) => {
    const d = doc.data();
    const name = typeof d.name === "string" ? d.name : "";
    const url = typeof d.url === "string" ? d.url : "";
    return { id: doc.id, name, url };
  });
}

export async function fetchStoreHoursForServer(): Promise<StoreHour[]> {
  const snapshot = await getDocs(bizCol("hours"));
  return snapshot.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        days: typeof d.days === "string" ? d.days : "",
        time: typeof d.time === "string" ? d.time : "",
        order: typeof d.order === "number" ? d.order : 0,
      };
    })
    .sort((a, b) => a.order - b.order);
}

/** Cached store hours (dedupes within one request across home + contact pages). */
export const getStoreHours = cache(fetchStoreHoursForServer);

export async function fetchDailySpecialsForServer(): Promise<DailySpecial[]> {
  const snapshot = await getDocs(bizCol("dailySpecials"));
  return snapshot.docs.map((doc) => {
    const d = doc.data();
    const rawRange = d.timeRange;
    const timeRange: TimeRange =
      rawRange &&
      typeof rawRange === "object" &&
      "startTime" in rawRange &&
      "endTime" in rawRange
        ? {
            startTime:
              typeof (rawRange as { startTime: unknown }).startTime === "string"
                ? (rawRange as { startTime: string }).startTime
                : "",
            endTime:
              typeof (rawRange as { endTime: unknown }).endTime === "string"
                ? (rawRange as { endTime: string }).endTime
                : "",
          }
        : { startTime: "", endTime: "" };
    const dayOfWeek =
      typeof d.dayOfWeek === "string" && DAY_VALUES.includes(d.dayOfWeek)
        ? (d.dayOfWeek as DayOfWeek)
        : DayOfWeek.MONDAY;
    return {
      id: doc.id,
      dayOfWeek,
      timeRange,
      itemIds: Array.isArray(d.itemIds)
        ? (d.itemIds as string[]).filter((id) => typeof id === "string")
        : undefined,
      createdAt: (d.createdAt?.toDate?.() ?? new Date()) as Date,
    };
  });
}

export async function fetchDailySpecialItemsForServer(): Promise<
  DailySpecialItem[]
> {
  const snapshot = await getDocs(bizCol("dailySpecialItems"));
  return snapshot.docs.map((doc) => {
    const d = doc.data();
    const price =
      typeof d.price === "number" && Number.isFinite(d.price) ? d.price : 0;
    return {
      id: doc.id,
      name: typeof d.name === "string" ? d.name : "",
      price,
      options: Array.isArray(d.options)
        ? (d.options as string[]).filter((o) => typeof o === "string")
        : undefined,
      dayOfWeekIds: Array.isArray(d.dayOfWeekIds)
        ? (d.dayOfWeekIds as string[]).filter((id) => typeof id === "string")
        : undefined,
      createdAt: (d.createdAt?.toDate?.() ?? new Date()) as Date,
    };
  });
}

/** Data for the home page (updates + daily specials only; gallery is loaded on /gallery). */
export type PublicSiteData = {
  updates: ImageItem[];
  updatesError: string | null;
  dailySpecials: DailySpecial[];
  dailySpecialItems: DailySpecialItem[];
  dailySpecialsError: string | null;
  storeHours: StoreHour[];
  storeHoursError: string | null;
};

async function loadDailySpecialsBundle(): Promise<{
  dailySpecials: DailySpecial[];
  dailySpecialItems: DailySpecialItem[];
  error: string | null;
}> {
  let dailySpecials: DailySpecial[] = [];
  let dailySpecialItems: DailySpecialItem[] = [];
  let specialsErr: string | null = null;
  let itemsErr: string | null = null;

  try {
    dailySpecials = await fetchDailySpecialsForServer();
  } catch (err) {
    specialsErr =
      err instanceof Error ? err.message : "Failed to load daily specials";
  }
  try {
    dailySpecialItems = await fetchDailySpecialItemsForServer();
  } catch (err) {
    itemsErr =
      err instanceof Error ? err.message : "Failed to load daily special items";
  }

  const error =
    specialsErr && itemsErr
      ? `${specialsErr}; ${itemsErr}`
      : specialsErr ?? itemsErr;

  return { dailySpecials, dailySpecialItems, error };
}

/** Cached bundle for menu page + home daily section (dedupes within one request). */
export const getDailySpecialsBundle = cache(loadDailySpecialsBundle);

async function loadPublicSiteData(): Promise<PublicSiteData> {
  const [updatesResult, daily, hoursResult] = await Promise.all([
    fetchUpdatesForServer()
      .then((updates) => ({ updates, error: null as string | null }))
      .catch((err) => ({
        updates: [] as ImageItem[],
        error:
          err instanceof Error ? err.message : "Failed to load news & updates",
      })),
    getDailySpecialsBundle(),
    getStoreHours()
      .then((storeHours) => ({ storeHours, error: null as string | null }))
      .catch((err) => ({
        storeHours: [] as StoreHour[],
        error: err instanceof Error ? err.message : "Failed to load store hours",
      })),
  ]);

  return {
    updates: updatesResult.updates,
    updatesError: updatesResult.error,
    dailySpecials: daily.dailySpecials,
    dailySpecialItems: daily.dailySpecialItems,
    dailySpecialsError: daily.error,
    storeHours: hoursResult.storeHours,
    storeHoursError: hoursResult.error,
  };
}

/** Home + any server tree that needs all public CMS slices in one round-trip. */
export const getPublicSiteData = cache(loadPublicSiteData);
