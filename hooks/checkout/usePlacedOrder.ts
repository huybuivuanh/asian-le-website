import { bizDoc } from "@/lib/business";
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { postJson } from "@/lib/apiClient";
import type { FulfillmentWire } from "@/lib/orderApi";
import { OrderStatus, TakeOutFulfillmentKind } from "@/types/enum";

/** What the customer sees about an order once it's placed. */
export type PlacedOrder = {
  orderNumber: string;
  total: number;
  fulfillment: FulfillmentWire;
  /** Estimated rewards points, if a member was signed in (earned at pickup). */
  rewardsPoints: number | null;
  /** Points used for money off (taken at pickup), 0 if none. */
  pointsUsed: number;
  discount: number;
};

export type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  // Saved (status "New" in Firestore) but not yet accepted by the restaurant — waiting
  // for a live status change before showing the order number.
  | { status: "confirming"; orderId: string; order: PlacedOrder }
  | {
      status: "success";
      order: PlacedOrder;
      // Only for ASAP orders — worked out once from the readyTimeMinutes staff set when
      // accepting, so it doesn't drift if they change the wait time later.
      readyBy: Date | null;
    }
  | { status: "cancelled" };

/**
 * The checkout's submit state, plus what happens after the order is saved: watching the
 * order doc until the restaurant accepts or cancels it, and letting the customer cancel
 * while it's still waiting (/api/orders/[orderId]/cancel).
 */
export function usePlacedOrder() {
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const confirmingOrderId = submitState.status === "confirming" ? submitState.orderId : null;
  useEffect(() => {
    if (!confirmingOrderId) return;
    return onSnapshot(bizDoc("orders", confirmingOrderId), (snapshot) => {
      const data = snapshot.data();
      const status = data?.status as OrderStatus | undefined;
      setSubmitState((prev) => {
        if (prev.status !== "confirming") return prev;
        if (status === OrderStatus.Cancelled) return { status: "cancelled" };
        if (status !== OrderStatus.InProgress && status !== OrderStatus.Completed) return prev;
        // The POS writes readyTimeMinutes onto the order right when staff accept it.
        const fulfillment = data?.fulfillment as OrderFulfillment | undefined;
        const readyBy =
          fulfillment?.kind === TakeOutFulfillmentKind.Immediate &&
          typeof fulfillment.readyTimeMinutes === "number"
            ? new Date(Date.now() + fulfillment.readyTimeMinutes * 60_000)
            : null;
        return { status: "success", order: prev.order, readyBy };
      });
    });
  }, [confirmingOrderId]);

  async function cancelOrder() {
    if (submitState.status !== "confirming") return;
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await postJson<{ ok: true }>(`/api/orders/${submitState.orderId}/cancel`);
      if (!result.ok) {
        // If the restaurant just accepted it, the listener above moves this to "success"
        // on its own — show the reason in the meantime.
        setCancelError(result.error ?? "Couldn't cancel your order. Please try again.");
        return;
      }
      setSubmitState({ status: "cancelled" });
    } catch {
      setCancelError("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  return { submitState, setSubmitState, cancelOrder, cancelling, cancelError };
}
