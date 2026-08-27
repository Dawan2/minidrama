import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MeApiProvider, useMeApi } from './me-api-context';
import { stubMeApi } from '../testing/me-fixtures';

function MeApiProbe(): React.JSX.Element {
  const api = useMeApi();
  return <p data-testid="probe">{typeof api.fetchMe}</p>;
}

describe('the me client context', () => {
  it('hands the provided client to the surface below it', () => {
    render(
      <MeApiProvider api={stubMeApi()}>
        <MeApiProbe />
      </MeApiProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('function');
  });

  it('refuses to render without a provider', () => {
    expect(() => render(<MeApiProbe />)).toThrow(/MeApiProvider/);
  });
});
