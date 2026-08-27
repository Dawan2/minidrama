import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { dramaPrimaryCta } from './drama-continue-cta';
import type { DramaLastWatched } from '@minidrama/shared';

const LAST: DramaLastWatched = {
  episodeId: 'ep_test_0007',
  episodeNumber: 7,
  positionSec: 42,
};

describe('dramaPrimaryCta', () => {
  it('continues at lastWatched even when a different episode is the first openable', () => {
    expect(
      dramaPrimaryCta({ lastWatched: LAST, openableEpisodeId: 'ep_test_0001' }),
    ).toEqual({
      kind: 'continue',
      episodeId: 'ep_test_0007',
      episodeNumber: 7,
    });
  });

  it('continues at lastWatched when the loaded page has nothing openable', () => {
    expect(dramaPrimaryCta({ lastWatched: LAST, openableEpisodeId: undefined })).toEqual({
      kind: 'continue',
      episodeId: 'ep_test_0007',
      episodeNumber: 7,
    });
  });

  // lastWatched is a pointer, not "everything at or below this number". The href is one id.
  it('does not walk backward from lastWatched to episode one', () => {
    const cta = dramaPrimaryCta({ lastWatched: LAST, openableEpisodeId: 'ep_test_0001' });
    expect(cta?.kind).toBe('continue');
    expect(cta && cta.kind === 'continue' ? cta.episodeId : undefined).toBe('ep_test_0007');
    expect(cta && cta.kind === 'continue' ? cta.episodeNumber : undefined).not.toBe(1);
  });

  it('does not put positionSec into the decision — resume is a session fact', () => {
    const cta = dramaPrimaryCta({ lastWatched: LAST, openableEpisodeId: 'ep_test_0001' });
    expect(cta).not.toMatchObject({ positionSec: 42 });
    expect(JSON.stringify(cta)).not.toMatch(/positionSec|42/);
  });

  it('falls back to Watch now when progress looked and found nothing', () => {
    expect(
      dramaPrimaryCta({ lastWatched: null, openableEpisodeId: 'ep_test_0002' }),
    ).toEqual({ kind: 'watch', episodeId: 'ep_test_0002' });
  });

  it('falls back to Watch now when progress has not produced a view', () => {
    expect(
      dramaPrimaryCta({ lastWatched: undefined, openableEpisodeId: 'ep_test_0002' }),
    ).toEqual({ kind: 'watch', episodeId: 'ep_test_0002' });
  });

  it('omits the button when there is no lastWatched and nothing openable', () => {
    expect(dramaPrimaryCta({ lastWatched: null, openableEpisodeId: undefined })).toBeNull();
    expect(dramaPrimaryCta({ lastWatched: undefined, openableEpisodeId: undefined })).toBeNull();
  });
});

describe('DramaPage source', () => {
  // Vitest runs this package with cwd = `app/`. jsdom's `import.meta.url` is not a file: URL.
  const source = readFileSync(join(process.cwd(), 'src/routes/DramaPage.tsx'), 'utf8');

  it('reads continue from the drama-progress batch, not from catalogue viewer.lastWatched', () => {
    expect(source).toMatch(/fetchDramaProgress/);
    expect(source).toMatch(/progress\.resource\.data\.lastWatched/);
    expect(source).not.toMatch(/drama\.viewer\?\.lastWatched|viewer\.lastWatched/);
  });

  // HOME already projects CONTINUE_WATCHING onto continue-rail. A second rail here would retake
  // that slice. The player siblings own PlayPage / PlayerSurface / swipe / heartbeats.
  it('does not retake HOME continue or the in-flight player interaction files', () => {
    expect(source).not.toMatch(/home-feed|splitHomeFeed|continue-rail|HomePage/);
    expect(source).not.toMatch(/PlayerSurface|episode-swipe|progress-heartbeat|playbackRate/);
    expect(source).not.toMatch(/vid_demo_|BytePlus|#\/vip|postgres:/);
  });
});
