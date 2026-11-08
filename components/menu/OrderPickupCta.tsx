"use client";

import { bizDoc } from "@/lib/business";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getDoc, onSnapshot } from "firebase/firestore";
import { isStoreOpenNow } from "@/lib/availability";
import { mapStoreSettingsDoc } from "@/lib/storeSettings";
import OrderingUnavailableModal from "@/components/menu/OrderingUnavailableModal";

type OrderPickupCtaProps = {
  /** The page's ISR snapshot of settings/store, kept live from here. Leave out where the
   * page has none (the nav): settings/store is then read once, when the button is pressed. */
  storeSettings?: StoreSettings;
  className: string;
  children: ReactNode;
  /** Runs before navigating or showing the modal (e.g. close the mobile menu). */
  onPress?: () => void;
};

/** "Order online" CTA — checks store availability (hours, holidays, pause switch) before
 * going to /order, and shows OrderingUnavailableModal instead when the store isn't taking
 * orders. Used on /menu (hero, category bar, closing band), the home page and the nav. */
export default function OrderPickupCta({
  storeSettings: initialStoreSettings,
  className,
  children,
  onPress,
}: OrderPickupCtaProps) {
  const router = useRouter();
  const [liveSettings, setLiveSettings] = useState(initialStoreSettings);
  const [checking, setChecking] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);

  // With a snapshot from the page, follow the live doc (the snapshot can be 15 min stale).
  useEffect(() => {
    if (!initialStoreSettings) return;
    return onSnapshot(bizDoc("settings", "store"), (snapshot) => {
      setLiveSettings(mapStoreSettingsDoc(snapshot.data(), initialStoreSettings));
    });
    // Subscribe once on mount; `initialStoreSettings` is only the fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(async () => {
    onPress?.();
    let settings = liveSettings;
    if (!settings) {
      setChecking(true);
      try {
        settings = mapStoreSettingsDoc((await getDoc(bizDoc("settings", "store"))).data());
      } catch {
        // Couldn't check (offline etc.): let /order show its own state.
        router.push("/order");
        return;
      } finally {
        setChecking(false);
      }
    }
    if (isStoreOpenNow(settings)) router.push("/order");
    else setShowUnavailable(true);
  }, [liveSettings, onPress, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={checking}
        aria-busy={checking}
        className={className}
      >
        {children}
      </button>
      <OrderingUnavailableModal open={showUnavailable} onClose={() => setShowUnavailable(false)} />
    </>
  );
}
