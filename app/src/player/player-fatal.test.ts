import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { err, ok } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import { playbackDescriptor, playbackHttpFailure } from '../testing/playback-fixtures';
import { classifyReissue, exhaustedReissueError, planFatalReissue } from './player-fatal';

describe('planFatalReissue', () => {
  it('requests a mint on the first fatal and gives up on the second', () => {
    expect(planFatalReissue(0)).toBe('REQUEST');
    expect(planFatalReissue(1)).toBe('EXHAUSTED');
    expect(planFatalReissue(2)).toBe('EXHAUSTED');
  });
});

describe('classifyReissue', () => {
  it('continues on a 201 so the user never sees a token swap', () => {
    const next = playbackDescriptor({ episodeId: 'ep_test_0001', playAuthToken: 'token-new' });
    expect(classifyReissue(ok(next))).toEqual({
      kind: 'CONTINUE',
      descriptor: next,
    });
  });

  it('opens the unlock overlay on a commercial lock, not a broken player', () => {
    expect(classifyReissue(err(playbackHttpFailure(403, 'EPISODE_LOCKED')))).toEqual({
      kind: 'LOCKED',
    });
    expect(classifyReissue(err(playbackHttpFailure(401, 'AUTH_REQUIRED')))).toEqual({
      kind: 'LOCKED',
    });
  });

  it('treats 409 as blocked: no retry, no price, no second episode', () => {
    expect(classifyReissue(err(playbackHttpFailure(409)))).toEqual({ kind: 'BLOCKED' });
  });

  it('keeps a 503 as retryable so a preparing asset is not a dead end', () => {
    const result = classifyReissue(err(playbackHttpFailure(503, 'EPISODE_ASSET_UNAVAILABLE')));
    expect(result.kind).toBe('RETRYABLE');
  });

  it('keeps a 404 as terminal, because repeating a missing episode cannot succeed', () => {
    const result = classifyReissue(err(playbackHttpFailure(404, 'CONTENT_NOT_FOUND')));
    expect(result.kind).toBe('TERMINAL');
    if (result.kind === 'TERMINAL') {
      expect(result.error.reason).toBe('NOT_FOUND');
    }
  });

  it('does not turn a URL-shaped 201 into a continue — that refusal is MALFORMED upstream', () => {
    const result = classifyReissue(
      err(apiFailure({ kind: 'MALFORMED', message: 'the response did not match' })),
    );
    expect(result.kind).toBe('RETRYABLE');
  });
});

describe('exhaustedReissueError', () => {
  it('is retryable and never names a playAuthToken', () => {
    const error = exhaustedReissueError();
    expect(error.kind).toBe('RETRYABLE');
    expect(JSON.stringify(error)).not.toMatch(/playAuthToken|token-old|eyJ/);
  });
});

describe('this slice does not open the forbidden leftovers', () => {
  it('does not invent 倍速, axe-core, a subscription path, or postgres', () => {
    const source = readFileSync(join(process.cwd(), 'src/player/player-fatal.ts'), 'utf8');
    expect(source).not.toMatch(/playbackRate|axe-core|#\/vip|postgres:/);
  });
});
