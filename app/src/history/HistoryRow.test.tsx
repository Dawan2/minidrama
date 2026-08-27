import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { HistoryRow } from './HistoryRow';
import { dramaSummary } from '../testing/catalog-fixtures';
import { renderSurface } from '../testing/render';
import { watchHistoryEntry } from '../testing/history-fixtures';
import type { WatchHistoryEntry } from '../data/history-api';

/** The row is a list item, so it is rendered in the list it belongs to. */
function renderRow(entry: WatchHistoryEntry) {
  return renderSurface(
    <ul>
      <HistoryRow entry={entry} />
    </ul>,
  );
}

describe('a history row', () => {
  // The one-tap resume is the entire product purpose of this screen. Routing it through the detail
  // screen would ask the viewer to find their own place again (`docs/02-user-journeys.md` J3).
  it('resumes in the player when the entry carries an episode id', () => {
    renderRow(watchHistoryEntry({ lastEpisodeId: 'ep_test_0007' }));

    const row = screen.getByTestId('history-row');
    expect(row.getAttribute('data-destination')).toBe('PLAYER');
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/play/ep_test_0007');
  });

  /**
   * The contract's history entry has no episode id and the player route is addressed by one, so a
   * server following the contract exactly produces this row. Opening the drama is two taps to
   * resume, which is worse than one; a row that goes nowhere is not a product at all.
   */
  it('opens the drama when there is no episode id to resume', () => {
    renderRow(watchHistoryEntry({ drama: dramaSummary({ id: 'drm_9' }), lastEpisodeId: null }));

    const row = screen.getByTestId('history-row');
    expect(row.getAttribute('data-destination')).toBe('DRAMA');
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/drama/drm_9');
  });

  it('says which episode the viewer was on', () => {
    renderRow(watchHistoryEntry({ lastEpisodeNumber: 12 }));
    expect(screen.getByTestId('history-resume').textContent).toContain('12');
  });

  /**
   * The resume point is the server's to apply: the playback token carries `resumePositionSec`
   * (`docs/12-api-contracts.md` §4.4). A client that printed it would be quoting a number it has no
   * authority over and cannot keep in step across devices.
   */
  it('never displays the resume position', () => {
    renderRow(watchHistoryEntry({ lastPositionSec: 42 }));
    expect(screen.getByTestId('history-row').textContent).not.toContain('42');
  });

  // Every cover in the seed catalogue points at `.invalid`, so the alt text is what a viewer
  // actually reads today (`docs/handoff/w2-work-d.md` §5).
  it('labels the cover with the drama title', () => {
    renderRow(watchHistoryEntry());
    expect(screen.getByTestId('cover-image').getAttribute('alt')).toBe('The Heiress Returns');
  });
});
