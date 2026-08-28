/**
 * Pull one ATX heading and its body from a markdown file.
 *
 * QA-011 reverse-verification reads `docs/14-test-plan.md` §6.2 / §6.4 and
 * `docs/14-quality-gates.md` §5.4. A heading that is missing, or a slice that
 * walks into the next same-or-higher section, would let a revert look green.
 */

export function markdownSection(markdown: string, headingLine: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line === headingLine);
  if (start < 0) {
    return '';
  }

  const marks = headingLine.match(/^#+/)?.[0] ?? '';
  const level = marks.length;
  if (level === 0) {
    return '';
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    const next = /^(#+)\s/.exec(line);
    const marks = next?.[1];
    if (marks !== undefined && marks.length <= level) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}
