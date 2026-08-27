import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  documentedOperations,
  liveKeysFromTable,
  operationKey,
  parseParityTable,
} from './parity.js';
import { repoRoot } from './paths.js';

const openapi = readFileSync(join(repoRoot, 'contracts/openapi.yaml'), 'utf8');
const doc12 = readFileSync(join(repoRoot, 'docs/12-api-contracts.md'), 'utf8');
const parity = readFileSync(join(repoRoot, 'docs/12-api-parity.md'), 'utf8');

describe('parseParityTable', () => {
  it('reads live keys out of the committed table shape', () => {
    const markdown = [
      '| Doc 12 | Live OpenAPI | Status | Notes |',
      '|---|---|---|---|',
      '| — | `GET /health` | live-only | ops |',
      '| `POST /auth/login` | `POST /v1/auth/login` | live | |',
      '| `GET /config` | — | design-only | |',
    ].join('\n');

    expect(parseParityTable(markdown)).toEqual([
      { doc12: undefined, live: 'GET /health', status: 'live-only' },
      { doc12: 'POST /auth/login', live: 'POST /v1/auth/login', status: 'live' },
      { doc12: 'GET /config', live: undefined, status: 'design-only' },
    ]);
  });
});

describe('contract parity table (D-07 / D-11)', () => {
  it('lists every live OpenAPI operation', () => {
    const live = documentedOperations(openapi).map(operationKey).sort();
    const table = liveKeysFromTable(parseParityTable(parity));
    expect(table).toEqual(live);
  });

  it('no longer names two unlock path shapes in doc 12', () => {
    expect(doc12).not.toMatch(/POST \/episodes\/\{id\}\/unlock/);
    expect(doc12).not.toMatch(/POST \/dramas\/\{id\}\/unlock/);
    expect(doc12).toMatch(/POST \/episodes\/\{episodeId\}\/unlock/);
    expect(doc12).toMatch(/POST \/dramas\/\{dramaId\}\/unlock/);
  });
});
