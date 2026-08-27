import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProgressApiProvider, useProgressApi } from './progress-api-context';
import { stubProgressApi } from '../testing/progress-fixtures';

function ProgressApiProbe(): React.JSX.Element {
  const api = useProgressApi();
  return <p data-testid="probe">{typeof api.fetchDramaProgress}</p>;
}

describe('the progress client context', () => {
  it('hands the provided client to the surface below it', () => {
    render(
      <ProgressApiProvider api={stubProgressApi()}>
        <ProgressApiProbe />
      </ProgressApiProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('function');
  });

  it('refuses to render without a provider', () => {
    expect(() => render(<ProgressApiProbe />)).toThrow(/ProgressApiProvider/);
  });
});
