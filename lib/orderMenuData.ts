import { bizCol } from "@/lib/business";
import { cache } from "react";
import {
  getDocs,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { mapImageItemField, sortAlphabetically } from "@/lib/utils";
import { KitchenType } from "@/types/enum";

/**
 * Server-side fetchers for the ordering data model (categories / menuItems /
 * optionGroups / options), per ecommerce.md. The fetch*ForServer functions are for Server
 * Components only, but the exported mapDocTo* mappers are pure (no server-only deps) and
 * are also reused client-side by components/order/LiveOrderMenu.tsx to map onSnapshot
 * documents identically to how the SSR fetch maps them.
 */

const KITCHEN_TYPES: KitchenType[] = Object.values(KitchenType);

const AVAILABILITY_DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

function mapTimeRange(raw: unknown): TimeRange | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const startTime = (raw as { startTime?: unknown }).startTime;
  const endTime = (raw as { endTime?: unknown }).endTime;
  if (typeof startTime !== "string" || typeof endTime !== "string") return undefined;
  return { startTime, endTime };
}

/** Absent/non-object means unrestricted (`undefined`, per Availability's contract) — but a
 * present object with no matching day keys, e.g. `{}`, decodes to `{}`, not `undefined`:
 * that's "restricted to zero days" (always unavailable), a distinct state from unrestricted. */
export function mapAvailability(raw: unknown): Availability | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const result: Availability = {};
  for (const day of AVAILABILITY_DAY_KEYS) {
    const range = mapTimeRange((raw as Record<string, unknown>)[day]);
    if (range) result[day] = range;
  }
  return result;
}

/** Absent/malformed both mean "not sold out" — unlike settings/store's pausedUntil,
 * this is a sparse per-item field where the safe default is available, not paused. */
export function mapSoldOutUntil(raw: unknown): Date | undefined {
  return raw instanceof Timestamp ? raw.toDate() : undefined;
}

function mapStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const filtered = raw.filter((v): v is string => typeof v === "string");
  return filtered.length > 0 ? filtered : undefined;
}

/** Normalizes optionGroupIds to `{optionGroupId, order}[]`, sorted by order ascending.
 * Legacy docs may store plain `string[]` — those get index-based order. */
function normalizeOptionGroupRefs(raw: unknown): OptionGroupId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const refs = raw
    .map((entry, index): OptionGroupId | null => {
      if (typeof entry === "string") return { optionGroupId: entry, order: index };
      if (entry && typeof entry === "object" && typeof (entry as { optionGroupId?: unknown }).optionGroupId === "string") {
        const order = (entry as { order?: unknown }).order;
        return {
          optionGroupId: (entry as { optionGroupId: string }).optionGroupId,
          order: typeof order === "number" ? order : index,
        };
      }
      return null;
    })
    .filter((v): v is OptionGroupId => v !== null);
  return refs.length > 0 ? refs.sort((a, b) => a.order - b.order) : undefined;
}

export function mapDocToFoodCategory(doc: QueryDocumentSnapshot<DocumentData>): FoodCategory {
  const d = doc.data();
  return {
    id: doc.id,
    name: (d.name as string) ?? "",
    description: d.description as string | undefined,
    itemIds: mapStringArray(d.itemIds),
    order: typeof d.order === "number" ? d.order : 0,
    createdAt: (d.createdAt?.toDate?.() ?? new Date()) as Date,
  };
}

export function mapDocToMenuItem(doc: QueryDocumentSnapshot<DocumentData>): MenuItem {
  const d = doc.data();
  const price = typeof d.price === "number" && Number.isFinite(d.price) ? d.price : 0;
  const kitchenType = KITCHEN_TYPES.includes(d.kitchenType)
    ? (d.kitchenType as KitchenType)
    : KitchenType.Other;
  return {
    id: doc.id,
    name: (d.name as string) ?? "",
    description: d.description as string | undefined,
    price,
    image: mapImageItemField(d.image),
    optionGroupIds: normalizeOptionGroupRefs(d.optionGroupIds),
    categoryIds: mapStringArray(d.categoryIds),
    kitchenType,
    availability: mapAvailability(d.availability),
    soldOutUntil: mapSoldOutUntil(d.soldOutUntil),
    createdAt: (d.createdAt?.toDate?.() ?? new Date()) as Date,
  };
}

export function mapDocToOptionGroup(doc: QueryDocumentSnapshot<DocumentData>): OptionGroup {
  const d = doc.data();
  return {
    id: doc.id,
    name: (d.name as string) ?? "",
    minSelection: typeof d.minSelection === "number" ? d.minSelection : 0,
    maxSelection: typeof d.maxSelection === "number" ? d.maxSelection : 1,
    multipleOptionQuantity: d.multipleOptionQuantity === true,
    optionIds: mapStringArray(d.optionIds),
    itemIds: mapStringArray(d.itemIds),
    defaultOptionId: typeof d.defaultOptionId === "string" ? d.defaultOptionId : undefined,
    createdAt: (d.createdAt?.toDate?.() ?? new Date()) as Date,
  };
}

export function mapDocToItemOption(doc: QueryDocumentSnapshot<DocumentData>): ItemOption {
  const d = doc.data();
  const price = typeof d.price === "number" && Number.isFinite(d.price) ? d.price : 0;
  return {
    id: doc.id,
    name: (d.name as string) ?? "",
    price,
    groupIds: mapStringArray(d.groupIds),
    availability: mapAvailability(d.availability),
    soldOutUntil: mapSoldOutUntil(d.soldOutUntil),
    createdAt: (d.createdAt?.toDate?.() ?? new Date()) as Date,
  };
}

export async function fetchCategoriesForServer(): Promise<FoodCategory[]> {
  const q = query(bizCol("webCategories"), orderBy("order"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapDocToFoodCategory);
}

export async function fetchMenuItemsForServer(): Promise<MenuItem[]> {
  const snapshot = await getDocs(bizCol("webMenuItems"));
  const items = snapshot.docs.map(mapDocToMenuItem);
  return sortAlphabetically(items, (item) => item.name);
}

export async function fetchOptionGroupsForServer(): Promise<OptionGroup[]> {
  const snapshot = await getDocs(bizCol("webOptionGroups"));
  return snapshot.docs.map(mapDocToOptionGroup);
}

export async function fetchItemOptionsForServer(): Promise<ItemOption[]> {
  const snapshot = await getDocs(bizCol("webOptions"));
  return snapshot.docs.map(mapDocToItemOption);
}

async function loadOrderMenuDataForServer(): Promise<{
  categories: FoodCategory[];
  menuItems: MenuItem[];
  optionGroups: OptionGroup[];
  options: ItemOption[];
}> {
  const [categories, menuItems, optionGroups, options] = await Promise.all([
    fetchCategoriesForServer(),
    fetchMenuItemsForServer(),
    fetchOptionGroupsForServer(),
    fetchItemOptionsForServer(),
  ]);
  return { categories, menuItems, optionGroups, options };
}

/** Deduped per request when referenced from multiple server components. */
export const fetchOrderMenuDataForServer = cache(loadOrderMenuDataForServer);
