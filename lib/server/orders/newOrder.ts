import "server-only";
import { adminBizCol } from "@/lib/server/business";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import type { CustomerInfo } from "@/lib/server/orders/customer";
import { OrderStatus } from "@/types/enum";

/**
 * Builds a new `orders` document — the shape the admin app reads (see orders-schema.md),
 * shared by /api/orders and /api/reservations so both always write the same fields.
 */

/** Hashes the Firestore doc id into a 6-digit number, purely for a short, easy-to-call-out
 * pickup code — not a uniqueness guarantee. */
export function orderNumberFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1_000_000;
  }
  return hash.toString().padStart(6, "0");
}

/** A fresh `orders/{id}` reference and its pickup code (nothing is written yet). */
export function newOrderRef(): { ref: DocumentReference; orderNumber: string } {
  const ref = adminBizCol("orders").doc();
  return { ref, orderNumber: orderNumberFromId(ref.id) };
}

type NewOrderInput = {
  orderNumber: string;
  customer: CustomerInfo;
  fulfillment: OrderFulfillment;
  orderItems: OrderItem[];
  taxBreakDown: OrderTaxBreakDown;
  loyalty?: OrderLoyalty | null;
};

export function newOrderDoc({
  orderNumber,
  customer,
  fulfillment,
  orderItems,
  taxBreakDown,
  loyalty,
}: NewOrderInput) {
  return {
    orderNumber,
    status: OrderStatus.New,
    fulfillment,
    ...customer,
    orderItems,
    printed: false,
    paid: false,
    taxBreakDown,
    ...(loyalty ? { loyalty } : {}),
    createdAt: FieldValue.serverTimestamp(),
  };
}
