// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import {
  configuredInterstitialAdUnitId,
  configuredRewardedAdUnitId,
  readConfiguredAdUnitId,
  rewardedAdsAvailable,
} from './ad-units';

describe('readConfiguredAdUnitId', () => {
  it('is null when the value is missing, blank, or not a string', () => {
    expect(readConfiguredAdUnitId(undefined)).toBeNull();
    expect(readConfiguredAdUnitId('')).toBeNull();
    expect(readConfiguredAdUnitId('   ')).toBeNull();
    expect(readConfiguredAdUnitId(123)).toBeNull();
  });

  it('returns a trimmed non-empty id', () => {
    expect(readConfiguredAdUnitId(' unit-from-env ')).toBe('unit-from-env');
  });
});

describe('configured unit ids', () => {
  it('are absent from an empty env — GATE-4 is unanswered', () => {
    expect(configuredRewardedAdUnitId({})).toBeNull();
    expect(configuredInterstitialAdUnitId({})).toBeNull();
  });

  it('does not invent a fallback id when the env key is present but empty', () => {
    expect(configuredRewardedAdUnitId({ VITE_REWARDED_AD_UNIT_ID: '' })).toBeNull();
  });
});

describe('rewardedAdsAvailable', () => {
  it('is false without a unit id even when the capability is present', () => {
    expect(rewardedAdsAvailable(true, null)).toBe(false);
    expect(rewardedAdsAvailable(false, 'unit')).toBe(false);
    expect(rewardedAdsAvailable(true, 'unit')).toBe(true);
  });
});

describe('product source does not invent a unit id', () => {
  const APP_SRC = fileURLToPath(new URL('..', import.meta.url));

  function walk(dir: string): readonly string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        found.push(...walk(full));
      } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        found.push(full);
      }
    }
    return found;
  }

  it('has no hardcoded numeric placement id outside tests', () => {
    const offenders: string[] = [];
    for (const file of walk(join(APP_SRC, 'ads'))) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const path = relative(APP_SRC, file);
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
          if (/'[0-9]{6,}'/.test(line) || /"[0-9]{6,}"/.test(line)) {
            offenders.push(`${path}:${String(index + 1)}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
