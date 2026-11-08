import "server-only";
import { adminBizCol } from "@/lib/server/business";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { pendingRedeemPoints } from "@/lib/rewardsRules";
import { OrderStatus } from "@/types/enum";

/**
 * Points a member can use on a new online order = their rewards balance minus points
 * already promised on their other open online orders (taken only on Complete, so they're
 * still in the balance). See lib/rewardsRules.ts.
 */

/** Orders whose promised points haven't been taken or released yet. */
export const OPEN_ORDER_STATUSES = [
  OrderStatus.New,
  OrderStatus.InProgress,
  OrderStatus.ReadyForPickup,
] as const;

/** The member's open online orders (this site's `orders`). */
export function memberOpenOrdersQuery(memberId: string): Query {
  return adminBizCol("orders")
    .where("loyalty.memberId", "==", memberId)
    .where("status", "in", [...OPEN_ORDER_STATUSES]);
}

/** Points promised on these open orders and not yet taken. */
export function pendingPointsFromDocs(docs: QueryDocumentSnapshot[]): number {
  return pendingRedeemPoints(
    docs.map((d) => d.data() as Parameters<typeof pendingRedeemPoints>[0][number]),
    OPEN_ORDER_STATUSES,
  );
}

export type MemberProfile = { name: string; points: number };

/**
 * The member's name and points balance from businesses/{id}/members/{memberId} (Admin
 * SDK, same project) — so they come from the database, not from the browser. Call only
 * with a memberId from a verified sign-in token. Null if it can't be read.
 */
export async function fetchMemberProfile(memberId: string): Promise<MemberProfile | null> {
  try {
    const snap = await adminBizCol("members").doc(memberId).get();
    if (!snap.exists) return null;
    const points = snap.get("points");
    if (typeof points !== "number" || !Number.isFinite(points)) return null;
    const name = snap.get("name");
    return { name: typeof name === "string" ? name.trim() : "", points };
  } catch {
    return null;
  }
}
