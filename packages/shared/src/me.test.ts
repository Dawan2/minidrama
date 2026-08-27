import { describe, expect, it } from 'vitest';

import { ME_VIEW_KEYS, type MeView } from './me.js';

describe('MeView', () => {
  it('can be only an id, which is the session identity rather than a full profile', () => {
    const view: MeView = { id: 'open_abc' };
    expect(view.nickname).toBeUndefined();
    expect(view.avatarUrl).toBeUndefined();
  });

  it('can carry a platform-named nickname without inventing an avatar', () => {
    const view: MeView = { id: 'open_abc', nickname: 'Ada' };
    expect(view.nickname).toBe('Ada');
    expect(view.avatarUrl).toBeUndefined();
  });

  it('names only id, nickname and avatarUrl as allowed keys', () => {
    expect(ME_VIEW_KEYS).toEqual(['id', 'nickname', 'avatarUrl']);
  });
});
