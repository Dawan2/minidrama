import { TRUSTED_COVER_HOSTS } from '@minidrama/config';
import { describe, expect, it } from 'vitest';

import { SEED_DRAMAS } from './fixtures.js';
import { coverRejections, safeCoverUrl } from './covers.js';
import type { DramaRecord } from './types.js';

/**
 * The registry is the `.invalid` placeholder until the real platform image host is known
 * (U-IMG-1), so every case below is written against `TRUSTED_COVER_HOSTS` rather than against a
 * literal. The day the placeholder is replaced, these tests must keep passing unchanged — a test
 * that hard-coded `cdn.example.invalid` would instead have to be edited alongside the registry,
 * which is how a rename quietly turns an allowlist test into a test of nothing.
 */
const TRUSTED_HOST = TRUSTED_COVER_HOSTS[0]?.host as string;
const TRUSTED_COVER = `https://${TRUSTED_HOST}/covers/reborn-at-the-banquet.jpg`;

/**
 * `no-script-url` bans this scheme from source, which is the rule these tests exist to confirm the
 * catalogue enforces on *data*. A test that cannot name the thing it refuses is not a test, so the
 * scheme is written once, here, and every case below is built from it.
 */
// eslint-disable-next-line no-script-url -- naming the refused scheme is the point of the file
const SCRIPT_SCHEME = 'javascript:';
const SCRIPT_URL = `${SCRIPT_SCHEME}alert(1)`;

describe('safeCoverUrl', () => {
  it('passes a cover on a registered host', () => {
    expect(safeCoverUrl(TRUSTED_COVER)).toBe(TRUSTED_COVER);
  });

  it('omits a cover on a host nobody registered', () => {
    expect(safeCoverUrl('https://cdn.evil.example/covers/anything.jpg')).toBeNull();
  });

  it('omits rather than reports when the field is simply absent', () => {
    expect(safeCoverUrl(null)).toBeNull();
  });

  it('omits an empty or whitespace-only field', () => {
    expect(safeCoverUrl('')).toBeNull();
    expect(safeCoverUrl('   ')).toBeNull();
  });

  /**
   * The scheme cases are the reason this gate exists at all. An `<img src>` will not execute a
   * `javascript:` URL today, but a cover is also the thumbnail that eventually gets wrapped in a
   * link or dropped into a CSS `url()`, and the stored field is the same field either way.
   */
  it.each([
    ['script-scheme', SCRIPT_URL],
    ['leading-whitespace script-scheme', `\n  ${SCRIPT_URL}`],
    ['control-character script-scheme', `\u0001${SCRIPT_URL}`],
    ['data:', 'data:image/svg+xml;base64,PHN2Zy8+'],
    ['blob:', 'blob:https://cdn.example.invalid/8f9c'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['plain http', `http://${TRUSTED_HOST}/covers/x.jpg`],
    ['protocol-relative', `//${TRUSTED_HOST}/covers/x.jpg`],
    ['relative path', '/covers/x.jpg'],
  ])('omits a %s cover', (_label, raw) => {
    expect(safeCoverUrl(raw)).toBeNull();
  });

  /** A host written to be misread by a human reviewer, and by a suffix or prefix match. */
  it.each([
    ['embedded credentials', `https://${TRUSTED_HOST}@cdn.evil.example/x.jpg`],
    [
      'trusted name as a subdomain of an attacker domain',
      `https://${TRUSTED_HOST}.evil.example/x.jpg`,
    ],
    ['attacker name with the trusted name as a suffix', `https://evil-${TRUSTED_HOST}/x.jpg`],
    ['a subdomain of the trusted host', `https://covers.${TRUSTED_HOST}/x.jpg`],
    ['a port nobody registered', `https://${TRUSTED_HOST}:8443/covers/x.jpg`],
  ])('omits a cover with %s', (_label, raw) => {
    expect(safeCoverUrl(raw)).toBeNull();
  });

  /**
   * The value served is the URL as parsed, not the string that arrived. Checking one spelling and
   * rendering another is the shape of every sanitiser bypass ever written, so the normalisation has
   * to be observable here rather than assumed.
   */
  it('returns the parsed URL, not the input spelling', () => {
    const messy = `https://${TRUSTED_HOST.toUpperCase()}/covers/../covers/x.jpg`;

    expect(safeCoverUrl(messy)).toBe(`https://${TRUSTED_HOST}/covers/x.jpg`);
  });

  it('keeps the trailing-slash form the parser produces', () => {
    expect(safeCoverUrl(`https://${TRUSTED_HOST}`)).toBe(`https://${TRUSTED_HOST}/`);
  });
});

function dramaWith(covers: Partial<Pick<DramaRecord, 'coverUrl' | 'horizontalCoverUrl'>>) {
  return { ...(SEED_DRAMAS[0] as DramaRecord), ...covers };
}

describe('coverRejections', () => {
  it('finds nothing wrong with a record whose covers are all trusted', () => {
    expect(coverRejections(dramaWith({}))).toEqual([]);
  });

  it('names the field, the value and the reason', () => {
    const rejections = coverRejections(
      dramaWith({ coverUrl: 'https://cdn.evil.example/x.jpg', horizontalCoverUrl: null }),
    );

    expect(rejections).toEqual([
      {
        field: 'coverUrl',
        value: 'https://cdn.evil.example/x.jpg',
        rejection: 'HOST_NOT_TRUSTED',
      },
    ]);
  });

  it('reports both cover fields independently', () => {
    const rejections = coverRejections(
      dramaWith({
        coverUrl: SCRIPT_URL,
        horizontalCoverUrl: 'https://cdn.evil.example/wide.jpg',
      }),
    );

    expect(rejections.map((entry) => [entry.field, entry.rejection])).toEqual([
      ['coverUrl', 'SCHEME_NOT_ALLOWED'],
      ['horizontalCoverUrl', 'HOST_NOT_TRUSTED'],
    ]);
  });

  /**
   * A nullable field being null is not a finding. A report that fired on every drama without a
   * horizontal cover would be noise, and noise is what makes the real finding unreadable.
   */
  it('stays quiet about an absent horizontal cover', () => {
    expect(coverRejections(dramaWith({ horizontalCoverUrl: null }))).toEqual([]);
  });

  it('stays quiet about an empty horizontal cover, which is still just absent', () => {
    expect(coverRejections(dramaWith({ horizontalCoverUrl: '   ' }))).toEqual([]);
  });
});

/**
 * The seed catalogue is content data, and content data is exactly what this gate distrusts — so the
 * fixtures are held to the rule rather than exempted from it. The distinction the two tests draw is
 * the whole design: data we control must fail *loudly* in CI, and data we do not control must fail
 * *safely* at runtime. A fixture that stopped being trusted would otherwise show up as a storefront
 * full of missing artwork, which reads as a CSS bug.
 */
describe('the seed catalogue', () => {
  it.each(SEED_DRAMAS.map((drama) => [drama.id, drama] as const))(
    '%s carries only covers the registry trusts',
    (_id, drama) => {
      expect(coverRejections(drama)).toEqual([]);
    },
  );

  it('has a cover on every drama, so an omitted cover always means a refusal', () => {
    for (const drama of SEED_DRAMAS) {
      expect(safeCoverUrl(drama.coverUrl)).not.toBeNull();
    }
  });
});
