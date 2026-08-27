import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
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

describe('the splash and boot files do not invent comments-on', () => {
  it('names no comments: true, legal URL, ad-unit id or Beans rate outside comments', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const files = ['SplashScreen.tsx', 'BootError.tsx'];
    const forbidden =
      /comments:\s*true|termsUrl|privacyUrl|adUnitId|beansPerCoin|coinToBeans|BEANS_RATE/;
    const offenders: string[] = [];

    for (const file of files) {
      readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const trimmed = line.trimStart();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            return;
          }
          if (forbidden.test(line)) {
            offenders.push(`${file}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
