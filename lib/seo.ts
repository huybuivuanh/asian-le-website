import type { Metadata } from "next";

export const SITE_NAME = "Asian Le Restaurant";
export const SITE_URL = "https://www.asianle.ca";
export const SITE_DESCRIPTION =
  "Chinese and Vietnamese restaurant in Prince Albert, SK — dine-in, takeout, daily lunch specials, and Skip the Dishes delivery.";

/** Picture shown when a link is shared. Placeholder (dining room) — swap
 * public/og-image.jpg for a better 1200×630 photo later. */
export const SHARE_IMAGE = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "The dining room at Asian Le Restaurant in Prince Albert",
};

/** Shared Open Graph fields. Next.js replaces (doesn't merge) a parent's `openGraph`,
 * so every page has to repeat these. */
const BASE_OPEN_GRAPH = {
  siteName: SITE_NAME,
  locale: "en_CA",
  type: "website" as const,
  images: [SHARE_IMAGE],
};

type PageMetadataInput = {
  /** URL path, e.g. "/menu" — used for the canonical link and og:url. */
  path: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
};

/** Title, description, canonical link and full Open Graph tags for a public page. */
export function pageMetadata({
  path,
  title,
  description,
  ogTitle,
  ogDescription,
}: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      ...BASE_OPEN_GRAPH,
      title: ogTitle ?? title,
      description: ogDescription ?? description,
      url: path,
    },
  };
}

export const ROOT_OPEN_GRAPH = {
  ...BASE_OPEN_GRAPH,
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
};
