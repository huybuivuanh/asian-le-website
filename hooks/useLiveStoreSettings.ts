"use client";

import { bizDoc } from "@/lib/business";
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { mapStoreSettingsDoc } from "@/lib/storeSettings";

/**
 * Subscribes to settings/store so store-hours/pause-ordering gating is never more than a
 * live Firestore round-trip stale — starts from `initial` (the SSR/ISR snapshot) and swaps
 * in the live doc once the first onSnapshot fires. Used anywhere availability needs to be
 * checked outside of /order's already-live LiveOrderMenu, e.g. the /menu "Order and pay
 * when pick up" CTA, which would otherwise gate on a snapshot up to 15 minutes stale (ISR).
 */
export function useLiveStoreSettings(initial: StoreSettings): StoreSettings {
  const [storeSettings, setStoreSettings] = useState(initial);

  useEffect(() => {
    const unsub = onSnapshot(bizDoc("settings", "store"), (snapshot) => {
      setStoreSettings(mapStoreSettingsDoc(snapshot.data(), initial));
    });
    return unsub;
    // `initial` is only read as a fallback inside the callback — the subscription itself
    // should only be set up once on mount, not torn down/recreated on every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return storeSettings;
}
