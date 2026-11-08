"use client";

import { bizCol } from "@/lib/business";
import { useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { sortAlphabetically } from "@/lib/utils";
import {
  mapDocToFoodCategory,
  mapDocToMenuItem,
  mapDocToOptionGroup,
  mapDocToItemOption,
} from "@/lib/orderMenuData";
import { buildMenuItemViewModel } from "@/lib/menuOptions";
import { isStoreOpenNow } from "@/lib/availability";
import { useLiveStoreSettings } from "@/hooks/useLiveStoreSettings";
import MenuCategoryBar from "@/components/menu/MenuCategoryBar";
import OrderMenuItemCard from "@/components/menu/OrderMenuItemCard";

/**
 * Owns all of /order's reactive data: subscribes to categories, menuItems,
 * optionGroups, options, and settings/store via onSnapshot, and re-renders the category
 * tabs + item grid with live data — not just availability, the whole catalog (names,
 * prices, descriptions, images, category membership). The SSR-fetched initial* props are
 * only the first-paint fallback; live data takes over once the first snapshot for each
 * collection arrives. This is what makes /order avoid the 15-minute ISR staleness window
 * /menu accepts — that was the entire point of splitting /order out in the first place.
 */

// Re-evaluate availability windows (e.g. "Available 11:00-14:00") periodically, since
// nothing in Firestore changes at the moment a window opens/closes.
const TIME_RECHECK_INTERVAL_MS = 60_000;

export default function LiveOrderMenu({
  initialCategories,
  initialMenuItems,
  initialOptionGroups,
  initialOptions,
  initialStoreSettings,
  openItemId,
}: {
  initialCategories: FoodCategory[];
  initialMenuItems: MenuItem[];
  initialOptionGroups: OptionGroup[];
  initialOptions: ItemOption[];
  initialStoreSettings: StoreSettings;
  openItemId?: string;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [menuItems, setMenuItems] = useState(initialMenuItems);
  const [optionGroups, setOptionGroups] = useState(initialOptionGroups);
  const [options, setOptions] = useState(initialOptions);
  const storeSettings = useLiveStoreSettings(initialStoreSettings);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const unsubCategories = onSnapshot(bizCol("webCategories"), (snapshot) => {
      const mapped = snapshot.docs.map(mapDocToFoodCategory);
      setCategories([...mapped].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
    const unsubItems = onSnapshot(bizCol("webMenuItems"), (snapshot) => {
      const mapped = snapshot.docs.map(mapDocToMenuItem);
      setMenuItems(sortAlphabetically(mapped, (item) => item.name));
    });
    const unsubOptionGroups = onSnapshot(bizCol("webOptionGroups"), (snapshot) => {
      setOptionGroups(snapshot.docs.map(mapDocToOptionGroup));
    });
    const unsubOptions = onSnapshot(bizCol("webOptions"), (snapshot) => {
      setOptions(snapshot.docs.map(mapDocToItemOption));
    });
    const interval = setInterval(() => setNow(new Date()), TIME_RECHECK_INTERVAL_MS);
    return () => {
      unsubCategories();
      unsubItems();
      unsubOptionGroups();
      unsubOptions();
      clearInterval(interval);
    };
  }, []);

  const itemViewModels = useMemo(() => {
    const optionGroupsById = new Map(optionGroups.map((g) => [g.id, g]));
    const optionsById = new Map(options.map((o) => [o.id, o]));
    return menuItems.map((item) =>
      buildMenuItemViewModel(
        item,
        optionGroupsById,
        optionsById,
        storeSettings.timezone,
        now,
      ),
    );
  }, [menuItems, optionGroups, options, storeSettings.timezone, now]);

  const isOrderingAvailable = isStoreOpenNow(storeSettings, now);

  const sections = categories
    .map((category) => ({
      category,
      items: itemViewModels.filter((vm) => vm.item.categoryIds?.includes(category.id)),
    }))
    .filter((section) => section.items.length > 0);

  const categoryLinks = sections.map(({ category }) => ({
    id: `category-${category.id}`,
    label: category.name,
  }));

  return (
    <>
      <MenuCategoryBar links={categoryLinks} />

      <section className="mx-auto max-w-7xl px-4 pb-24 pt-14 sm:px-6 lg:px-8">
        {sections.map(({ category, items }, categoryIndex) => (
          <div key={category.id} id={`category-${category.id}`} className="scroll-mt-36 pb-14">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-ink pb-3">
              <h2 className="text-[clamp(1.6rem,3vw,2rem)] font-extrabold leading-tight tracking-[-0.02em]">
                {category.name}
              </h2>
              <span className="text-sm font-semibold text-muted">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
              {category.description ? (
                <span className="ml-auto text-[17px] font-medium text-body">
                  {category.description}
                </span>
              ) : null}
            </div>
            <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((vm, itemIndex) => (
                <OrderMenuItemCard
                  key={vm.item.id}
                  {...vm}
                  isOrderingAvailable={isOrderingAvailable}
                  autoOpen={vm.item.id === openItemId}
                  priority={categoryIndex === 0 && itemIndex < 2}
                />
              ))}
            </ul>
          </div>
        ))}
        <p className="border-t border-sand-line pt-8 text-center text-sm text-muted">
          Please let us know about any allergies or dietary restrictions in the item&apos;s
          special instructions.
        </p>
      </section>
    </>
  );
}
