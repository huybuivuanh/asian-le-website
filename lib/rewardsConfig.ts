/**
 * Asian Le Rewards settings. Rewards lives in the same Firebase project as this site
 * (members under businesses/{id}/members), so there's no second config. Safe on the
 * server and in the browser — only public NEXT_PUBLIC_* values.
 * Set NEXT_PUBLIC_REWARDS_ENABLED=false to hide the rewards feature.
 */

/** The shared project: customers' sign-in tokens are issued for it. */
export const REWARDS_PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? "";

export const rewardsEnabled =
  process.env.NEXT_PUBLIC_REWARDS_ENABLED !== "false" && Boolean(REWARDS_PROJECT_ID);

/** Where customers create an account / see their points (the rewards web app). */
export const REWARDS_APP_URL =
  process.env.NEXT_PUBLIC_REWARDS_APP_URL ?? "https://rewards.asianle.ca";
