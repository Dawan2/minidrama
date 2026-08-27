import { TRUSTED_COVER_HOSTS, isTrustedCoverUrl } from '@minidrama/config';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CoverImage } from './CoverImage';
import { dramaSummary } from '../testing/catalog-fixtures';

/**
 * The cover allowlist, at the point where a string becomes a request the WebView makes.
 *
 * `checkCoverUrl` and `checkImageUrl` are tested exhaustively where they live
 * (`packages/config/src/cover-hosts.test.ts`, `packages/shared/src/image-url.test.ts`), and this
 * file does not re-test the decision. It tests that the component *takes* it: that a refused URL
 * never reaches an `<img src>`, that an accepted one is rendered as parsed rather than as written,
 * and that the placeholder a refusal produces is the same one the rest of the UI already knows how
 * to lay out.
 *
 * Every case is written against `TRUSTED_COVER_HOSTS` rather than a literal host, for the reason
 * `server/src/modules/catalog/covers.test.ts` gives: the registry is still the `.invalid`
 * placeholder (U-IMG-1), and a suite that hard-codes it would have to be edited the day the real
 * host arrives — which is how a rename turns an allowlist test into a test of nothing.
 */
const TRUSTED_HOST = TRUSTED_COVER_HOSTS[0]?.host as string;
const TRUSTED_COVER = `https://${TRUSTED_HOST}/covers/the-heiress.jpg`;

/**
 * `no-script-url` bans this scheme from source, which is the rule this file exists to confirm the
 * component enforces on *data*. A test that cannot name what it refuses is not a test.
 */
// eslint-disable-next-line no-script-url -- naming the refused scheme is the point of the file
const SCRIPT_SCHEME = 'javascript:';
const SCRIPT_URL = `${SCRIPT_SCHEME}alert(document.domain)`;

/** The shapes a hostile or careless cover field arrives in, and the refusal each one earns. */
const REFUSED: readonly (readonly [string, unknown, string])[] = [
  ['a host nobody registered', 'https://cdn.evil.example/covers/a.jpg', 'HOST_NOT_TRUSTED'],
  ['a prefix match', `https://${TRUSTED_HOST}.evil.example/a.jpg`, 'HOST_NOT_TRUSTED'],
  ['a suffix match', `https://evil${TRUSTED_HOST}/a.jpg`, 'HOST_NOT_TRUSTED'],
  ['a subdomain of a listed host', `https://sub.${TRUSTED_HOST}/a.jpg`, 'HOST_NOT_TRUSTED'],
  ['a script-scheme URL', SCRIPT_URL, 'SCHEME_NOT_ALLOWED'],
  ['a script scheme behind leading whitespace', `\n\t ${SCRIPT_URL}`, 'SCHEME_NOT_ALLOWED'],
  ['a data: image', 'data:image/svg+xml;base64,PHN2Zy8+', 'SCHEME_NOT_ALLOWED'],
  ['a blob: URL', `blob:https://${TRUSTED_HOST}/8f9c`, 'SCHEME_NOT_ALLOWED'],
  ['plain http on a listed host', `http://${TRUSTED_HOST}/a.jpg`, 'SCHEME_NOT_ALLOWED'],
  [
    'credentials naming a listed host',
    `https://${TRUSTED_HOST}@evil.example/a.jpg`,
    'CREDENTIALS_PRESENT',
  ],
  ['a port nobody registered', `https://${TRUSTED_HOST}:8443/a.jpg`, 'PORT_NOT_ALLOWED'],
  ['a protocol-relative URL', `//${TRUSTED_HOST}/a.jpg`, 'NOT_AN_ABSOLUTE_URL'],
  ['a relative path', '/covers/a.jpg', 'NOT_AN_ABSOLUTE_URL'],
  ['an empty field', '   ', 'MISSING'],
  ['nothing at all', null, 'MISSING'],
  ['whatever a JSON boundary handed us', 42, 'NOT_A_STRING'],
];

/** `src` is typed `string | null`; the cases above include what a wire response can actually be. */
function renderCover(src: unknown, alt = 'The Heiress Returns') {
  return render(<CoverImage src={src as string | null} alt={alt} />);
}

describe('a cover image renders a trusted URL', () => {
  it('renders the image with the title as its alt text', () => {
    renderCover(TRUSTED_COVER);

    const image = screen.getByTestId('cover-image');
    expect(image.getAttribute('src')).toBe(TRUSTED_COVER);
    expect(image.getAttribute('alt')).toBe('The Heiress Returns');
    expect(image.getAttribute('loading')).toBe('lazy');
  });

  it('keeps the query string a CDN resize needs', () => {
    const resized = `https://${TRUSTED_HOST}/c/1.jpg?w=360&fmt=webp`;
    renderCover(resized);

    expect(screen.getByTestId('cover-image').getAttribute('src')).toBe(resized);
  });

  /**
   * The rendered URL is `checkCoverUrl`'s value, not the prop. Checking one spelling and fetching
   * another is the shape of every sanitiser bypass ever written, and it is invisible in a test that
   * only asserts an image appeared.
   */
  it('renders the URL as parsed, not as it was written', () => {
    renderCover(`HTTPS://${TRUSTED_HOST.toUpperCase()}/Covers/A.jpg?w=1`);

    expect(screen.getByTestId('cover-image').getAttribute('src')).toBe(
      `https://${TRUSTED_HOST}/Covers/A.jpg?w=1`,
    );
  });

  it('renders the catalogue fixtures, so the suite would notice if the seed host drifted', () => {
    renderCover(dramaSummary().coverUrl);

    expect(screen.getByTestId('cover-image')).toBeDefined();
  });
});

describe('a cover image refuses everything else', () => {
  it.each(REFUSED)('renders a placeholder for %s', (_label, src, rejection) => {
    renderCover(src);

    expect(screen.queryByTestId('cover-image')).toBeNull();
    expect(screen.getByTestId('cover-placeholder').getAttribute('data-cover-rejection')).toBe(
      rejection,
    );
  });

  /**
   * Not "no `<img>`" — no trace. A refused URL written into a `data-` attribute, a `title` or a
   * comment is still a refused URL in the document, one copy-paste away from being fetched, and
   * the DOM is the artifact a viewer's device actually holds.
   */
  it('never writes the refused URL into the document', () => {
    for (const [, src] of REFUSED) {
      if (typeof src !== 'string') continue;

      const { unmount } = renderCover(src);
      expect(document.body.innerHTML).not.toContain('evil.example');
      expect(document.body.innerHTML).not.toContain(SCRIPT_SCHEME);
      expect(document.body.innerHTML).not.toContain('data:image');
      unmount();
    }
  });

  /**
   * The refusal reaches the same placeholder as a missing cover, because "nothing renderable" is
   * one state as far as layout is concerned — but the reason is on the element, so a blocked host
   * is not triaged as a drama nobody uploaded artwork for.
   */
  it('labels the placeholder with the drama title, exactly as a missing cover does', () => {
    renderCover('https://cdn.evil.example/a.jpg', 'The Heiress Returns');

    const placeholder = screen.getByTestId('cover-placeholder');
    expect(placeholder.getAttribute('aria-label')).toBe('The Heiress Returns');
    expect(placeholder.getAttribute('role')).toBe('img');
    expect(placeholder.className).toContain('cover--missing');
  });

  /**
   * The component and the predicate must not be able to disagree: a component that decided this
   * for itself would be a second allowlist, and the second one is the one that goes stale.
   */
  it('agrees with isTrustedCoverUrl on every case in this file', () => {
    const cases: readonly unknown[] = [
      TRUSTED_COVER,
      dramaSummary().coverUrl,
      ...REFUSED.map(([, src]) => src),
    ];

    for (const src of cases) {
      const { unmount } = renderCover(src);
      expect(screen.queryByTestId('cover-image') !== null).toBe(isTrustedCoverUrl(src));
      unmount();
    }
  });
});

describe('a cover image degrades when a trusted URL fails to load', () => {
  // Every seed cover points at `.invalid`, which cannot resolve, so this is today's normal path
  // rather than an edge case (`docs/handoff/w2-work-d.md` §5).
  it('degrades to a labelled placeholder instead of a broken-image icon', () => {
    renderCover(TRUSTED_COVER);

    fireEvent.error(screen.getByTestId('cover-image'));

    expect(screen.queryByTestId('cover-image')).toBeNull();
    const placeholder = screen.getByTestId('cover-placeholder');
    expect(placeholder.getAttribute('aria-label')).toBe('The Heiress Returns');
  });

  // A load failure is not a refusal, and the attribute says so: there is nothing to report to a
  // content editor about a host that was allowed and simply did not answer.
  it('carries no rejection reason when the URL was trusted and the fetch failed', () => {
    renderCover(TRUSTED_COVER);
    fireEvent.error(screen.getByTestId('cover-image'));

    expect(screen.getByTestId('cover-placeholder').hasAttribute('data-cover-rejection')).toBe(
      false,
    );
  });

  // Otherwise one broken cover keeps the placeholder for whatever scrolls into its position next.
  it('gives a new source a fresh chance to load', () => {
    const { rerender } = render(<CoverImage src={`https://${TRUSTED_HOST}/1.jpg`} alt="One" />);
    fireEvent.error(screen.getByTestId('cover-image'));
    expect(screen.getByTestId('cover-placeholder')).toBeDefined();

    rerender(<CoverImage src={`https://${TRUSTED_HOST}/2.jpg`} alt="Two" />);
    expect(screen.getByTestId('cover-image')).toBeDefined();
  });

  // A recycled row is the case that matters: the same component instance is handed a different
  // drama's cover, and the decision has to be retaken rather than remembered.
  it('retakes the decision when the source changes in either direction', () => {
    const { rerender } = render(<CoverImage src="https://cdn.evil.example/a.jpg" alt="One" />);
    expect(screen.queryByTestId('cover-image')).toBeNull();

    rerender(<CoverImage src={TRUSTED_COVER} alt="Two" />);
    expect(screen.getByTestId('cover-image').getAttribute('src')).toBe(TRUSTED_COVER);

    rerender(<CoverImage src={SCRIPT_URL} alt="Three" />);
    expect(screen.queryByTestId('cover-image')).toBeNull();
    expect(screen.getByTestId('cover-placeholder').getAttribute('data-cover-rejection')).toBe(
      'SCHEME_NOT_ALLOWED',
    );
  });
});
