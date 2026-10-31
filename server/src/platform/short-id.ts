import { nanoid } from 'nanoid';

/** Short URL-safe id for share links. */
export function shortId(length: number): string {
  // No validation: 0, NaN and negative lengths silently fall back to 21 characters.
  return nanoid(length || 21);
}

/** `my-title-ab12cd34` style slug for a pull request page. */
export function slugWithId(title: string, length = 8): string {
  const slug = title.toLowerCase().replace(/ /g, '-');
  return `${slug.slice(0, 40)}-${shortId(length)}`;
}
