import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, bundleFor, isRtl, translate } from './index';

describe('i18n', () => {
  it('defaults to English, which the platform requires for review', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  // Review requirement: the app must be compatible with English, and English must never fall
  // back to a raw key. A missing key here would ship a literal "home.heading" to a reviewer.
  it('has a non-empty English string for every key', () => {
    const english = bundleFor('en');
    expect(Object.keys(english).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(english)) {
      expect(value, `en is missing a value for "${key}"`).toBeTruthy();
    }
  });

  it('keeps every locale at parity with English', () => {
    const englishKeys = Object.keys(bundleFor('en')).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(bundleFor(locale)).sort(), `locale "${locale}" has drifted`).toEqual(
        englishKeys,
      );
    }
  });

  it('resolves a translation per locale', () => {
    expect(translate('nav.home', 'en')).toBe('Home');
    expect(translate('nav.home', 'ar')).not.toBe('Home');
  });

  // Saudi Arabia is a launch region, so RTL is a layout flip we owe from day one, not a retrofit.
  it('marks Arabic as right-to-left', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });
});
