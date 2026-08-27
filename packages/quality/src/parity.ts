/**
 * D-11 measurement helpers: live OpenAPI operations versus the design document.
 *
 * This package records the gap. It does not close it by inventing handlers or rewriting the
 * design surface into the live one.
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface Operation {
  readonly method: HttpMethod;
  readonly path: string;
}

export function operationKey(operation: Operation): string {
  return `${operation.method.toUpperCase()} ${operation.path}`;
}

export function documentedOperations(yaml: string): Operation[] {
  const operations: Operation[] = [];
  let inPaths = false;
  let currentPath: string | undefined;

  for (const line of yaml.split('\n')) {
    if (/^[a-zA-Z]/.test(line)) {
      inPaths = line.startsWith('paths:');
      currentPath = undefined;
      continue;
    }
    if (!inPaths) continue;

    const pathKey = /^ {2}(\/\S*):\s*$/.exec(line);
    if (pathKey?.[1] !== undefined) {
      currentPath = pathKey[1];
      continue;
    }

    const methodKey = /^ {4}([a-z]+):\s*$/.exec(line);
    const method = methodKey?.[1];
    if (currentPath !== undefined && method !== undefined) {
      if ((HTTP_METHODS as readonly string[]).includes(method)) {
        operations.push({ method: method as HttpMethod, path: currentPath });
      }
    }
  }

  return operations;
}

export interface ParityRow {
  readonly doc12: string | undefined;
  readonly live: string | undefined;
  readonly status: string;
}

const ROW = /^\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|/;

function cell(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '—' || trimmed === '-') return undefined;
  return trimmed.replace(/^`/, '').replace(/`$/, '');
}

export function parseParityTable(markdown: string): ParityRow[] {
  const rows: ParityRow[] = [];
  let inTable = false;

  for (const line of markdown.split('\n')) {
    if (line.startsWith('| Doc 12') || line.startsWith('|Doc 12')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (/^\|[-:\s|]+\|$/.test(line)) continue;
    if (!line.startsWith('|')) break;

    const match = ROW.exec(line);
    if (match === null) continue;
    const doc12 = cell(match[1] ?? '');
    const live = cell(match[2] ?? '');
    const status = (match[3] ?? '').trim();
    if (doc12 === undefined && live === undefined) continue;
    rows.push({ doc12, live, status });
  }

  return rows;
}

export function liveKeysFromTable(rows: readonly ParityRow[]): string[] {
  return rows
    .map((row) => row.live)
    .filter((value): value is string => value !== undefined)
    .sort();
}
