/**
 * Tag identity key. Tags are free-form, so "Slow Motion", "slow motion" and
 * "Slow-Motion" must collapse onto one tag rather than creating duplicates.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
