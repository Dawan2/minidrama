import { describe, expect, it } from 'vitest';

import { createUnavailableDramaProgressCatalogPort } from './drama-catalog-port.js';

describe('createUnavailableDramaProgressCatalogPort', () => {
  it('refuses rather than answering with no episodes', async () => {
    const port = createUnavailableDramaProgressCatalogPort();

    expect(await port.listDramaEpisodes('drm_revenge_0001')).toEqual({
      ok: false,
      error: 'CATALOG_UNAVAILABLE',
    });
  });

  it('refuses an empty id too, rather than looking like a working port', async () => {
    const port = createUnavailableDramaProgressCatalogPort();

    expect((await port.listDramaEpisodes('')).ok).toBe(false);
  });
});
