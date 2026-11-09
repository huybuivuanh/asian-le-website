import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { REWARDS_PROJECT_ID } from "@/lib/rewardsConfig";

/**
 * Verifies a customer's sign-in token for the shared project (the same login as the rewards
 * app), so an order can be linked to a member without trusting the browser. Checking a token only needs the
 * project id and Google's public keys — no rewards service account here.
 *
 * Done with `jose` directly, following Google's steps for verifying Firebase ID tokens
 * with a third-party JWT library. Not `firebase-admin/auth`: it loads `jose` via
 * require(), which Vercel's runtime rejects (ERR_REQUIRE_ESM) and crashed every route
 * that imported this file.
 */

const GOOGLE_KEYS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

/** The member's uid (= members/{uid} id) if the token is valid, otherwise null. */
export async function verifyRewardsIdToken(idToken: string): Promise<string | null> {
  if (!REWARDS_PROJECT_ID) return null;
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_KEYS, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${REWARDS_PROJECT_ID}`,
      audience: REWARDS_PROJECT_ID,
      requiredClaims: ["exp", "iat", "sub"],
      clockTolerance: 5,
    });
    const now = Math.floor(Date.now() / 1000) + 5;
    const authTime = payload.auth_time;
    if (typeof payload.iat !== "number" || payload.iat > now) return null;
    if (typeof authTime !== "number" || authTime > now) return null;
    // Staff / admin logins (with a `role` claim) aren't rewards members.
    if ("role" in payload) return null;
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
