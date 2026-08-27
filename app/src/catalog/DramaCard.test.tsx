import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { DramaCard } from './DramaCard';
import { dramaSummary } from '../testing/catalog-fixtures';
import { renderSurface } from '../testing/render';

describe('DramaCard', () => {
  it('opens the drama, never a player path, because browse is a catalogue not a resume', () => {
    renderSurface(
      <ul>
        <DramaCard drama={dramaSummary({ id: 'drm_9', title: 'Nine' })} />
      </ul>,
    );

    expect(screen.getByTestId('browse-card').querySelector('a')?.getAttribute('href')).toBe(
      '/drama/drm_9',
    );
    expect(screen.getByText('Nine')).toBeDefined();
    expect(screen.queryByTestId('feed-resume')).toBeNull();
  });

  it('keeps the free-window copy as display and never as a play decision', () => {
    renderSurface(
      <ul>
        <DramaCard drama={dramaSummary({ freeEpisodes: 3, totalEpisodes: 80 })} />
      </ul>,
    );
    expect(screen.getByTestId('free-badge').textContent).toContain('3');
  });
});
