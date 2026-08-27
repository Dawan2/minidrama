import { fileURLToPath } from 'node:url';

/** Repository root, resolved from this file rather than from `process.cwd()`. */
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
