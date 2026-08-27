import { fileURLToPath } from 'node:url';

/** Repository root, resolved from this file rather than from `process.cwd()`. */
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export const minisConfigPath = fileURLToPath(
  new URL('../../../app/minis.config.json', import.meta.url),
);
