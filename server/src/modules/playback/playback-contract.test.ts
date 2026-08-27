import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { loadConfig } from '../../config.js';

/**
 * The one thing the playback contract may never grow.
 *
 * Correction A4 (`docs/architecture/system-overview.md` §1.1) replaced the self-hosted delivery
 * design with an identifier-based one: episode video is BytePlus-hosted and played by VePlayer, and
 * this endpoint hands over the identifiers the player needs — never a URL, a signed URL, an asset
 * key or a quality ladder. A URL reappearing here would not be a small regression. It would mean we
 * had rebuilt a delivery path the platform prohibits, behind an endpoint that already passes tests.
 *
 * This file is deliberately additive-only. It asserts what must stay true of the playback contract
 * and does not pin what the contract contains, so another slot can extend playback — a lazy
 * `playAuthToken`, a resume position from the real progress module — without touching these tests.
 * A URL-shaped field, by any name, fails them.
 */

const CONTRACT_PATH = fileURLToPath(new URL('../../../../contracts/openapi.yaml', import.meta.url));
const contract = readFileSync(CONTRACT_PATH, 'utf8');

/** Names that mean "here is where the bytes are", in the spellings they usually arrive under. */
const MEDIA_HANDLE_NAME =
  /url|uri|src|href|m3u8|mp4|hls|dash|cdn|manifest|playlist|definition|quality|bitrate|resolution/i;

/**
 * A property-name scan, not a text scan. The schema descriptions in the contract say the words
 * "media URL" and "quality ladder" out loud — that prose is the reason the rule exists and must not
 * be what trips it.
 */
function schemaProperties(yaml: string, schemaName: string): readonly string[] {
  const lines = yaml.split('\n');
  const start = lines.indexOf(`    ${schemaName}:`);
  if (start === -1) throw new Error(`schema ${schemaName} is missing from the contract`);

  const properties: string[] = [];
  let inProperties = false;

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= 4) break;

    if (/^ {6}properties:\s*$/.test(line)) {
      inProperties = true;
      continue;
    }
    if (inProperties && indent <= 6) {
      inProperties = false;
      continue;
    }

    const key = inProperties ? /^ {8}([A-Za-z0-9_]+):/.exec(line) : null;
    if (key?.[1] !== undefined) properties.push(key[1]);
  }

  return properties;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('the documented playback contract', () => {
  it('still describes a VePlayer descriptor', () => {
    const properties = schemaProperties(contract, 'PlaybackDescriptor');

    // Present, not exhaustive: this fails on a removal or a rename, and stays out of the way of an
    // addition that is not a media handle.
    expect(properties).toEqual(
      expect.arrayContaining(['albumId', 'episodeId', 'vid', 'playAuthToken']),
    );
  });

  it.each(['PlaybackDescriptor', 'CreatePlaybackSessionRequest'])(
    'declares no media handle in %s',
    (schemaName) => {
      const offending = schemaProperties(contract, schemaName).filter((property) =>
        MEDIA_HANDLE_NAME.test(property),
      );

      expect(offending).toEqual([]);
    },
  );

  it('keeps playAuthToken optional, because most clients must never receive one', () => {
    // It is only needed below TikTok 44.5.0, it is short-lived, and a token issued to a client that
    // did not ask for it is a credential handed out for no reason.
    const required = /PlaybackDescriptor:\n\s+type: object\n\s+required: \[([^\]]*)\]/.exec(
      contract,
    );

    expect(required?.[1]).toBeDefined();
    expect(required?.[1]).not.toContain('playAuthToken');
  });
});

describe('the playback response', () => {
  // The stub entitlement rule in `playback/routes.ts` is Wave 1's and does not consult the
  // catalogue yet; these episode ids exercise the shape of the response, not the gate.
  const episodeIds = ['ep_revenge_e01', 'ep_dynasty_s2e01', 'ep_sweet_e02'];

  it.each(episodeIds)('hands over identifiers and nothing resolvable for %s', async (episodeId) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId },
    });

    expect(response.statusCode).toBe(201);
    const descriptor = response.json<PlaybackDescriptor & Record<string, unknown>>();

    const offending = Object.keys(descriptor).filter((key) => MEDIA_HANDLE_NAME.test(key));
    expect(offending).toEqual([]);
    expect(descriptor.albumId).toEqual(expect.any(String));
    expect(descriptor.vid).toEqual(expect.any(String));
  });

  it('contains no URL, no manifest extension and no quality ladder', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_revenge_e01' },
    });

    expect(response.body).not.toMatch(/https?:\/\//);
    expect(response.body).not.toMatch(/\/\/[a-z0-9.-]+\//i);
    expect(response.body).not.toMatch(/\.m3u8|\.mp4|\.mpd|\.ts\b/i);
    expect(response.body).not.toMatch(/1080p|720p|480p/i);
  });

  it('does not leak one through the denial path either', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_locked_0002' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toMatch(/https?:\/\/|\.m3u8|\.mp4/i);
  });
});

describe('the shared descriptor type', () => {
  /**
   * A compile-time assertion, so the field cannot be added in one commit and the runtime test
   * deleted in another. `Extract` resolving to `never` is the whole proof.
   */
  type MediaHandleKey = `${string}Url` | `${string}Uri` | 'url' | 'src' | `${string}Manifest`;
  const _descriptorCarriesNoMediaHandle: Extract<
    keyof PlaybackDescriptor,
    MediaHandleKey
  > extends never
    ? true
    : false = true;

  it('has no URL-shaped member', () => {
    expect(_descriptorCarriesNoMediaHandle).toBe(true);
  });
});
