import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SplashScreen } from './SplashScreen';
import { BootError } from './BootError';

describe('SCR-01 splash', () => {
  it('shows the brand and a loading line, and does not claim comments are on', () => {
    render(<SplashScreen />);

    const root = screen.getByTestId('splash-screen');
    expect(root.textContent).toMatch(/Minidrama/);
    expect(root.textContent).toMatch(/Starting/);
    expect(root.textContent).not.toMatch(/comment/i);
    expect(root.textContent).not.toMatch(/VIP|Beans|Terms|Privacy|ad unit/i);
  });
});

describe('SCR-01 init failure', () => {
  it('offers a retry and does not render a business screen', () => {
    const retries: number[] = [];
    render(<BootError onRetry={() => retries.push(1)} />);

    const root = screen.getByTestId('boot-error');
    expect(root.textContent).toMatch(/could not start/i);
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(retries).toEqual([1]);
  });
});
