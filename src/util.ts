/** Split a string into <=n-char pieces (Telegram caps messages at 4096). */
export function chunk(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.length ? out : [''];
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Pull the `description:` value out of SKILL.md frontmatter. */
export function parseSkillDescription(md: string): string {
  return md.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
}

/** Compact one-line label for a tool the agent is about to run. */
export function summarizeTool(name: string, input: unknown): string {
  const i = input as Record<string, unknown>;
  const detail =
    (i?.command as string) ?? (i?.file_path as string) ?? (i?.pattern as string) ?? '';
  return truncate(`🔧 ${name} ${detail}`.trim(), 200);
}
