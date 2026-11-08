import "server-only";
import { MAX_REDEEM_STEPS } from "@/lib/rewardsRules";
import { verifyRewardsIdToken } from "@/lib/server/rewards/auth";
import { fetchMemberProfile, type MemberProfile } from "@/lib/server/rewards/points";

/** A rewards member whose sign-in token checked out. */
export type VerifiedMember = {
  memberId: string;
  /** Name and balance from the database — null if it couldn't be read just now. */
  profile: MemberProfile | null;
};

/**
 * The signed-in rewards member for this request, if the browser sent a token.
 * `member: null` means no rewards sign-in (ordering without points is fine).
 */
export async function resolveRewardsMember(
  rewardsIdToken: unknown,
): Promise<{ member: VerifiedMember | null } | { error: string; status: number }> {
  if (typeof rewardsIdToken !== "string" || !rewardsIdToken) return { member: null };

  const memberId = await verifyRewardsIdToken(rewardsIdToken);
  if (!memberId) {
    return {
      error:
        "Your rewards sign-in has expired — please sign in again, or sign out to order without points.",
      status: 401,
    };
  }
  const profile = await fetchMemberProfile(memberId);
  return { member: { memberId, profile } };
}

/** $5-off steps the customer asked to use: 0 for none, otherwise 1..MAX_REDEEM_STEPS. */
export function parseRedeemSteps(raw: unknown): { steps: number } | { error: string } {
  if (raw == null || raw === 0) return { steps: 0 };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > MAX_REDEEM_STEPS) {
    return { error: "Invalid rewards points amount." };
  }
  return { steps: raw };
}
