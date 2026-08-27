import ar from './locales/ar.json';
import en from './locales/en.json';

/**
 * A deliberately small translation lookup for the skeleton.
 *
 * `react-i18next` with namespaced, lazily loaded bundles is the Wave 2 target
 * (`docs/architecture/tech-stack.md` T10). What matters *now* is the review constraint: the app
 * must be compatible with English, and English must never fall back to a raw key. That rule is
 * enforced by `i18n.test.ts` against the locale files, and it holds whatever the runtime becomes.
 */

export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Saudi Arabia is a launch region, so RTL is a day-one layout concern, not a retrofit. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

const BUNDLES: Record<Locale, Record<string, string>> = { en, ar };

export type TranslationKey = keyof typeof en;

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function translate(key: TranslationKey, locale: Locale = DEFAULT_LOCALE): string {
  return BUNDLES[locale][key] ?? BUNDLES[DEFAULT_LOCALE][key] ?? key;
}

export function bundleFor(locale: Locale): Readonly<Record<string, string>> {
  return BUNDLES[locale];
}
