import { adminBizCol } from "@/lib/server/business";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { jsonError } from "@/lib/server/http";
import { OrderStatus } from "@/types/enum";

/**
 * Customer-initiated cancellation while waiting for restaurant confirmation
 * (see hooks/checkout/usePlacedOrder.ts's "confirming" state). Only succeeds while the
 * order is still `New` — once the restaurant has moved it to InProgress (or
 * beyond), it's already being made and can no longer be cancelled from here.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const ref = adminBizCol("orders").doc(orderId);

  const result = await adminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return "not-found" as const;
    if (snapshot.data()?.status !== OrderStatus.New) return "too-late" as const;
    tx.update(ref, { status: OrderStatus.Cancelled });
    return "cancelled" as const;
  });

  if (result === "not-found") {
    return jsonError("Order not found", 404);
  }
  if (result === "too-late") {
    return jsonError(
      "The restaurant has already started on your order, so it can no longer be cancelled here — please call us if you need to make a change.",
      409,
    );
  }
  return NextResponse.json({ ok: true });
}
