import { afterEach, describe, expect, it } from 'vitest';
import type { DramaSearchResults } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { createSeedDramaDirectory } from './dramas.js';
import { loadConfig } from '../../config.js';
import type { AppDependencies } from '../../app.js';

/**
 * `GET /v1/search` over HTTP.
 *
 * Search is deliberately anonymous: browsing is anonymous by contract
 * (`docs/12-api-contracts.md` §2.2), and the Minis client's silent login can fail before the viewer
 * has typed anything. So the app is built exactly as it is deployed — no injected resolver — and
 * these tests double as the assertion that no credential is required.
 */

let app: FastifyInstance;

async function startApp(dependencies: AppDependencies = {}): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, dependencies);
  await app.ready();
}

function search(queryString: string) {
  return app.inject({ method: 'GET', url: `/v1/search${queryString}` });
}

function ids(results: DramaSearchResults): readonly string[] {
  return results.items.map((item) => item.dramaId);
}

afterEach(async () => {
  await app.close();
});

describe('GET /v1/search', () => {
  it('answers matches to an anonymous caller, with no credential at all', async () => {
    await startApp();

    const response = await search('?q=sweet');

    expect(response.statusCode).toBe(200);
    expect(ids(response.json<DramaSearchResults>())).toEqual(['drm_sweet_0003']);
  });

  it('returns the hit shape the contract publishes', async () => {
    await startApp();

    const response = await search('?q=Twin%20Moons');

    expect(response.json<DramaSearchResults>()).toEqual({
      query: 'Twin Moons',
      items: [
        {
          dramaId: 'drm_dynasty_0002',
          title: 'Twin Moons Dynasty',
          tags: ['revenge', 'time-travel'],
          matchedOn: 'TITLE',
        },
      ],
      truncated: false,
    });
  });

  it('reports a tag match as one', async () => {
    await startApp();

    const response = await search('?q=mystery');

    expect(response.json<DramaSearchResults>().items[0]?.matchedOn).toBe('TAG');
  });

  // The empty-result state is a screen (`docs/02-screen-inventory.md` SCR-03), not an error.
  it('answers 200 with no items when nothing matches', async () => {
    await startApp();

    const response = await search('?q=wuxia');

    expect(response.statusCode).toBe(200);
    expect(response.json<DramaSearchResults>()).toEqual({
      query: 'wuxia',
      items: [],
      truncated: false,
    });
  });

  it('echoes the normalised query in the viewer’s own casing', async () => {
    await startApp();

    const response = await search('?q=%20%20SWEET%20%20%20trap%20');

    expect(response.json<DramaSearchResults>().query).toBe('SWEET trap');
  });

  it('honours limit and says when it truncated', async () => {
    await startApp();

    const response = await search('?q=revenge&limit=1');

    expect(response.json<DramaSearchResults>()).toMatchObject({
      items: [{ dramaId: 'drm_revenge_0001' }],
      truncated: true,
    });
  });

  it('does not claim truncation when the limit exactly fits', async () => {
    await startApp();

    const response = await search('?q=revenge&limit=2');

    expect(response.json<DramaSearchResults>().truncated).toBe(false);
  });

  it.each([
    ['', 'q', 'required'],
    ['?q=', 'q', 'required'],
    ['?q=%20%20', 'q', 'required'],
    [`?q=${'x'.repeat(65)}`, 'q', 'out_of_range'],
    ['?q=sweet&q=trap', 'q', 'repeated'],
    ['?q=sweet&limit=0', 'limit', 'out_of_range'],
    ['?q=sweet&limit=51', 'limit', 'out_of_range'],
    ['?q=sweet&limit=all', 'limit', 'not_an_integer'],
  ])('refuses %j, naming %s as %s', async (queryString, field, reason) => {
    await startApp();

    const response = await search(queryString);

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      error: { code: string; details: { fields: { field: string; reason: string }[] } };
    }>();
    expect(body.error.code).toBe('COMMON_VALIDATION_FAILED');
    expect(body.error.details.fields[0]).toEqual({ field, reason });
  });

  // `E-13` in `docs/14-test-plan.md` §5.2. The delisted drama out-ranks most of the seed, so a
  // missing publication filter would put it near the top of a tag search rather than hide it.
  it.each([['withdrawn'], ['unannounced'], ['mystery']])(
    'never returns an unpublished drama for %j',
    async (query) => {
      await startApp();

      const response = await search(`?q=${query}`);

      expect(ids(response.json<DramaSearchResults>())).not.toContain('drm_offline_0007');
      expect(ids(response.json<DramaSearchResults>())).not.toContain('drm_draft_0008');
    },
  );

  it('serves the injected directory rather than the shipped seed', async () => {
    await startApp({
      dramaDirectory: createSeedDramaDirectory([
        {
          id: 'drm_injected',
          title: 'Injected Serial',
          tags: [],
          status: 'PUBLISHED',
          stat: { playCount: 1 },
        },
      ]),
    });

    const response = await search('?q=injected');

    expect(ids(response.json<DramaSearchResults>())).toEqual(['drm_injected']);
  });

  /**
   * The response is viewer-independent, and that is what makes it the one answer in this module a
   * shared cache could hold. These two tests are the tripwire on that: the day a hit carries a
   * `favorited` flag, or search starts resolving a viewer, one of them fails and the caching
   * question has to be answered again rather than inherited.
   */
  it('carries no per-viewer state', async () => {
    await startApp();

    const response = await search('?q=sweet');

    expect(response.body).not.toMatch(/favorited|viewer|userId|resumePosition/i);
  });

  it('answers a credentialled and an anonymous caller identically', async () => {
    await startApp();

    const anonymous = await search('?q=revenge');
    const credentialled = await app.inject({
      method: 'GET',
      url: '/v1/search?q=revenge',
      headers: { authorization: 'Bearer tok_whatever' },
    });

    expect(credentialled.statusCode).toBe(200);
    expect(credentialled.body).toBe(anonymous.body);
  });

  // Mirrors the playback and progress endpoints: no media handle of any kind leaves this server
  // outside a playback session (correction A4, `system-overview.md` §1.1).
  it('returns no URL of any kind', async () => {
    await startApp();

    const response = await search('?q=the');

    expect(response.body).not.toMatch(/https?:\/\//);
    expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|coverUrl|"vid"/i);
  });
});
