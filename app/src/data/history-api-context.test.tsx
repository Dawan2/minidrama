import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HistoryApiProvider, useHistoryApi } from './history-api-context';
import { stubHistoryApi } from '../testing/history-fixtures';

function HistoryApiProbe(): React.JSX.Element {
  const api = useHistoryApi();
  return <p data-testid="probe">{typeof api.fetchWatchHistory}</p>;
}

describe('the history client context', () => {
  it('hands the provided client to the surface below it', () => {
    render(
      <HistoryApiProvider api={stubHistoryApi()}>
        <HistoryApiProbe />
      </HistoryApiProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('function');
  });

  // A screen rendered with no client above it is a wiring bug. The loud failure is far cheaper than
  // a production error state nobody can explain, because nobody supplied a client.
  it('refuses to render without a provider', () => {
    expect(() => render(<HistoryApiProbe />)).toThrow(/HistoryApiProvider/);
  });
});
