import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { onSnapshot, type DocumentData } from "firebase/firestore";
import { bizDoc } from "@/lib/business";
import { getRewardsAuth } from "@/lib/rewardsFirebase";

/**
 * Browser-side rewards sign-in: the Firebase calls behind hooks/useRewardsMember.ts, kept
 * out of React so the hook only holds state. Actions return a customer-friendly error
 * message, or null on success.
 */

export type RewardsStatus =
  | "disabled" // no rewards config — hide the feature
  | "loading"
  | "signed-out"
  | "no-profile" // signed in, but never finished sign-up in the rewards app
  | "member";

export type RewardsSession = {
  status: RewardsStatus;
  user: User | null;
  member: RewardsMember | null;
};

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "No account found for this email.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/missing-email": "Enter your email address.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "No internet connection. Check your connection and try again.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups and try again.",
  "auth/account-exists-with-different-credential":
    "This email already has an account. Sign in with your email and password.",
};

const STAFF_ACCOUNT_MESSAGE =
  "This is a staff account. To use points, sign in with a personal rewards account.";

/** POS / admin logins have a `role` claim (customers have none) and can't use rewards. */
async function isStaffAccount(user: User): Promise<boolean> {
  try {
    return "role" in (await user.getIdTokenResult()).claims;
  } catch {
    return false; // offline: the server and security rules still refuse staff
  }
}

/** After a sign-in: a staff account is signed straight back out with a message. */
async function refuseStaff(user: User): Promise<string | null> {
  if (!(await isStaffAccount(user))) return null;
  await signOut(getRewardsAuth());
  return STAFF_ACCOUNT_MESSAGE;
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : null;
}

function authErrorMessage(error: unknown, fallback: string): string {
  return AUTH_ERRORS[errorCode(error) ?? ""] ?? fallback;
}

function toRewardsMember(id: string, d: DocumentData, user: User): RewardsMember {
  return {
    id,
    name: typeof d.name === "string" ? d.name : "",
    email: typeof d.email === "string" ? d.email : user.email ?? "",
    phone: typeof d.phone === "string" ? d.phone : "",
    points: typeof d.points === "number" ? d.points : 0,
    hasFirstOrder: d.firstOrderId != null,
  };
}

/**
 * Follows the rewards sign-in and the signed-in member's live doc
 * (businesses/{id}/members/{uid} — the rules let members read their own). Returns the unsubscribe function.
 */
export function subscribeToRewardsSession(onChange: (session: RewardsSession) => void) {
  let unsubMember: (() => void) | null = null;

  const unsubAuth = onAuthStateChanged(getRewardsAuth(), async (user) => {
    unsubMember?.();
    unsubMember = null;
    if (!user) {
      onChange({ status: "signed-out", user: null, member: null });
      return;
    }
    // Never treat a staff login as a rewards member (sign-in explains why).
    if (await isStaffAccount(user)) {
      await signOut(getRewardsAuth());
      return;
    }
    onChange({ status: "loading", user, member: null });
    unsubMember = onSnapshot(
      bizDoc("members", user.uid),
      (snap) =>
        onChange(
          snap.exists()
            ? { status: "member", user, member: toRewardsMember(snap.id, snap.data(), user) }
            : { status: "no-profile", user, member: null },
        ),
      () => onChange({ status: "no-profile", user, member: null }),
    );
  });

  return () => {
    unsubMember?.();
    unsubAuth();
  };
}

export async function signInWithEmail(email: string, password: string): Promise<string | null> {
  try {
    const { user } = await signInWithEmailAndPassword(getRewardsAuth(), email.trim(), password);
    return await refuseStaff(user);
  } catch (error) {
    return authErrorMessage(error, "Couldn't sign in. Please try again.");
  }
}

export async function signInWithGoogle(): Promise<string | null> {
  try {
    const { user } = await signInWithPopup(getRewardsAuth(), new GoogleAuthProvider());
    return await refuseStaff(user);
  } catch (error) {
    // The customer closing the Google window themselves isn't an error.
    const code = errorCode(error);
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return null;
    }
    return authErrorMessage(error, "Couldn't sign in with Google. Please try again.");
  }
}

export async function resetPassword(email: string): Promise<string | null> {
  try {
    await sendPasswordResetEmail(getRewardsAuth(), email.trim());
    return null;
  } catch (error) {
    return authErrorMessage(error, "Couldn't send the reset email. Please try again.");
  }
}

export async function signOutRewards(): Promise<void> {
  await signOut(getRewardsAuth());
}
