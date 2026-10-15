import { ALLOWED_EXTENSIONS } from "./constants";

/** Only `.md` and `.zip` can be imported (case-insensitive). */
export function isAllowedSkillFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Read a picked file as base64 (no `data:` prefix) for POST /skills/import/preview. */
export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** The URL field takes https links only; the server enforces the GitHub host allowlist. */
export function isHttpsUrl(value: string): boolean {
  return /^https:\/\/\S+$/i.test(value.trim());
}
