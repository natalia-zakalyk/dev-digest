import type { ConventionSkillDraft } from '@devdigest/shared';

export interface DraftConvention {
  rule: string;
  category: string | null;
  evidencePath: string | null;
  evidenceLineStart: number | null;
  evidenceLineEnd: number | null;
  evidenceSnippet: string | null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'rule';

/** Merge accepted conventions into one editable `convention` skill. Pure. */
export function buildSkillDraft(repoName: string, items: DraftConvention[]): ConventionSkillDraft {
  const name = `${slug(repoName)}-conventions`;
  const sections = items.map((c) => {
    const lines = [`## ${slug(c.rule)}`, c.rule, ''];
    if (c.category) lines.push(`Category: ${c.category}`, '');
    if (c.evidencePath) {
      const range =
        c.evidenceLineStart != null
          ? `:${c.evidenceLineStart}${c.evidenceLineEnd != null && c.evidenceLineEnd !== c.evidenceLineStart ? `-${c.evidenceLineEnd}` : ''}`
          : '';
      lines.push(`Detected in \`${c.evidencePath}${range}\`:`);
      if (c.evidenceSnippet) lines.push('', '```', c.evidenceSnippet, '```');
    }
    return lines.join('\n');
  });
  const body = [
    `# ${name}`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    '',
    sections.join('\n\n'),
  ].join('\n');
  return {
    name,
    description: `${items.length} house conventions extracted from ${repoName}`,
    type: 'convention',
    body,
  };
}
