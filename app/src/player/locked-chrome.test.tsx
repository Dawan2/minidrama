import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { render, screen } from '@testing-library/react';

import { dramaDetail, httpFailure } from '../testing/catalog-fixtures';
import { EMPTY_LOCKED_POSTER, LockedChrome, posterFromDrama } from './locked-chrome';

describe('posterFromDrama', () => {
  it('takes the drama cover and title, and does not invent a host when the read fails', () => {
    expect(posterFromDrama(ok(dramaDetail()))).toEqual({
      coverUrl: dramaDetail().coverUrl,
      title: dramaDetail().title,
    });
    expect(posterFromDrama(ok(dramaDetail({ coverUrl: null, title: 'Untitled' })))).toEqual({
      coverUrl: null,
      title: 'Untitled',
    });
    expect(posterFromDrama(err(httpFailure(404)))).toEqual(EMPTY_LOCKED_POSTER);
  });
});

describe('LockedChrome', () => {
  it('renders the cover through CoverImage and a lock mark, not a competing player', () => {
    render(<LockedChrome coverUrl={dramaDetail().coverUrl} title={dramaDetail().title} />);

    expect(screen.getByTestId('player-locked')).toBeDefined();
    expect(screen.getByTestId('player-locked-mark').textContent).toBe('Locked');
    expect(screen.getByTestId('cover-image').getAttribute('src')).toBe(dramaDetail().coverUrl);
    expect(screen.getByTestId('cover-image').getAttribute('alt')).toBe(dramaDetail().title);
    expect(screen.queryByTestId('player-container')).toBeNull();
  });

  it('keeps CoverImage’s placeholder when there is no cover to load', () => {
    render(<LockedChrome coverUrl={null} title="" />);

    expect(screen.getByTestId('cover-placeholder')).toBeDefined();
    expect(screen.getByTestId('player-locked-mark')).toBeDefined();
    expect(screen.queryByTestId('cover-image')).toBeNull();
  });
});

describe('this slice does not open the forbidden leftovers', () => {
  it('does not invent 倍速, a recharge route, a subscription path, or postgres', () => {
    const source = readFileSync(join(process.cwd(), 'src/player/locked-chrome.tsx'), 'utf8');
    expect(source).not.toMatch(/playbackRate|axe-core|#\/vip|#\/recharge|postgres:|vid_demo_/);
    expect(source).not.toMatch(/<img[\s/>]/);
  });
});
