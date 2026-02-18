import { MUNICIPALITY_COORDS } from "./constants";

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// Build slug → name map from MUNICIPALITY_COORDS keys
export const CONCELHO_SLUG_MAP: Record<string, string> = Object.fromEntries(
  Object.keys(MUNICIPALITY_COORDS).map((name) => [slugify(name), name])
);

export function parseConcelhoSlug(slug: string): string | null {
  return CONCELHO_SLUG_MAP[slug] ?? null;
}
