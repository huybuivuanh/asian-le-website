import "server-only";
import { bizPath } from "@/lib/business";
import { adminDb } from "@/lib/firebaseAdmin";

/** Admin SDK collection inside this site's business, e.g. adminBizCol("orders"). */
export const adminBizCol = (name: string) => adminDb.collection(bizPath(name));
