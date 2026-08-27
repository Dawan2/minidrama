import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PlaybackApiProvider, usePlaybackApi } from './playback-api-context';
import { stubPlaybackApi } from '../testing/playback-fixtures';

function PlaybackApiProbe(): React.JSX.Element {
  const api = usePlaybackApi();
  return <p data-testid="probe">{typeof api.createSession}</p>;
}

describe('the playback client context', () => {
  it('hands the provided client to the surface below it', () => {
    render(
      <PlaybackApiProvider api={stubPlaybackApi()}>
        <PlaybackApiProbe />
      </PlaybackApiProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('function');
  });

  it('refuses to render without a provider', () => {
    expect(() => render(<PlaybackApiProbe />)).toThrow(/PlaybackApiProvider/);
  });
});
