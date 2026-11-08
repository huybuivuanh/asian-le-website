// The business this website belongs to. All data lives under businesses/{businessId}/…
// in the shared asianlepos Firebase project (POS, Orders app, rewards, this site).
// Safe on the server and in the browser (client Firestore SDK).
import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Read by its full name so Next.js can inline it at build time.
export const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID ?? "";

function requireBusinessId(): string {
  if (!BUSINESS_ID) {
    throw new Error("Missing NEXT_PUBLIC_BUSINESS_ID (the businesses/{id} doc id). Add it to .env.local.");
  }
  return BUSINESS_ID;
}

/** "businesses/{id}/{name}" — for the Admin SDK on the server (lib/server/business.ts). */
export function bizPath(name: string): string {
  return `businesses/${requireBusinessId()}/${name}`;
}

/** A collection inside this site's business, e.g. bizCol("webMenuItems"). */
export function bizCol(name: string) {
  return collection(db, "businesses", requireBusinessId(), name);
}

/** A doc inside this site's business, e.g. bizDoc("settings", "store"). */
export function bizDoc(name: string, id: string) {
  return doc(db, "businesses", requireBusinessId(), name, id);
}
