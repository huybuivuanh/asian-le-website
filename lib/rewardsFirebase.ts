import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

/**
 * Rewards uses the site's own Firebase connection: members are in the same project
 * (businesses/{id}/members). Only used in the browser, for the optional rewards sign-in
 * at checkout (see lib/rewardsClient.ts).
 */
export const getRewardsAuth = (): Auth => auth;
export const getRewardsDb = (): Firestore => db;
