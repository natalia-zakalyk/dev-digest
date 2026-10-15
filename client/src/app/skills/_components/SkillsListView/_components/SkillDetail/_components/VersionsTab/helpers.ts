export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line diff (LCS) of `a` -> `b`. Fine for up to a few thousand lines. */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a === "" ? [] : a.split("\n");
  const y = b === "" ? [] : b.split("\n");
  const n = x.length;
  const m = y.length;
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  const at = (i: number, j: number) => lcs[i * w + j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = x[i] === y[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i] ?? "" });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      out.push({ kind: "del", text: x[i++] ?? "" });
    } else {
      out.push({ kind: "add", text: y[j++] ?? "" });
    }
  }
  while (i < n) out.push({ kind: "del", text: x[i++] ?? "" });
  while (j < m) out.push({ kind: "add", text: y[j++] ?? "" });
  return out;
}

/** Count of lines added / removed going from `prev` to `next`. */
export function summarizeChange(prev: string, next: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of diffLines(prev, next)) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
  }
  return { added, removed };
}

/** ISO timestamp -> YYYY-MM-DD. */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
