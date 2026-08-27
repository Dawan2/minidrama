import { describe, expect, it } from 'vitest';

import { createCatalogDramaProgressPort } from './drama-progress-lookup.js';
import { createInMemoryCatalogStore } from './store.js';

describe('createCatalogDramaProgressPort', () => {
  const port = createCatalogDramaProgressPort(createInMemoryCatalogStore());

  it('numbers a later-season episode across the drama, not within its season', async () => {
    const listed = await port.listDramaEpisodes('drm_dynasty_0002');
    if (!listed.ok) throw new Error('the seed catalogue refused');

    const seasonTwoOpener = listed.value.find(
      (episode) => episode.episodeId === 'ep_dynasty_s2e01',
    );

    expect(seasonTwoOpener?.globalEpisodeNumber).toBe(4);
  });

  it('leaves a draft episode out rather than numbering it', async () => {
    const listed = await port.listDramaEpisodes('drm_revenge_0001');
    if (!listed.ok) throw new Error('the seed catalogue refused');

    expect(listed.value.some((episode) => episode.episodeId === 'ep_revenge_e08')).toBe(false);
    expect(listed.value.map((episode) => episode.episodeId)).toContain('ep_revenge_e01');
  });

  it('leaves an offline season out, so its episodes cannot pick up a watched mark', async () => {
    const listed = await port.listDramaEpisodes('drm_dynasty_0002');
    if (!listed.ok) throw new Error('the seed catalogue refused');

    expect(listed.value.some((episode) => episode.episodeId === 'ep_dynasty_s3e01')).toBe(false);
  });

  it('answers empty for a drama that is not on the shelf, not a failure', async () => {
    expect(await port.listDramaEpisodes('drm_offline_0007')).toEqual({ ok: true, value: [] });
    expect(await port.listDramaEpisodes('drm_draft_0008')).toEqual({ ok: true, value: [] });
    expect(await port.listDramaEpisodes('drm_not_a_thing')).toEqual({ ok: true, value: [] });
  });
});
