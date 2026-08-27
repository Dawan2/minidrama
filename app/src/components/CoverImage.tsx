import { useEffect, useState } from 'react';
import { checkCoverUrl } from '@minidrama/config';

import { translate } from '../core/i18n';

/**
 * A poster that renders only a cover URL we trust, and a placeholder for everything else.
 *
 * Two different things reach the same placeholder here, and it is worth being clear about which is
 * which:
 *
 *   - **A cover that fails to load.** Every `coverUrl` in the seed catalogue points at
 *     `cdn.example.invalid`, which cannot resolve, so today *every* cover fails
 *     (`docs/handoff/w2-work-d.md` §5). The same thing happens in production the first time an
 *     image origin is missed in the Portal's trusted-domain list, and the failure mode there is a
 *     grid of broken icons with no explanation. Handling `onError` turns that into a legible
 *     layout.
 *   - **A cover we refuse to request at all.** `checkCoverUrl`
 *     (`packages/config/src/cover-hosts.ts`) is the allowlist decision, and this component is the
 *     last place it can be taken before a string out of the content database becomes a request the
 *     WebView makes. `server/src/modules/catalog/covers.ts` applies the same decision on the way
 *     out of the catalogue, which is where a bad cover gets *reported*; this is not a second
 *     opinion about the same data but the same rule applied at the other end of the wire, where
 *     the render actually happens. A component that trusts `src` because "the server checked it"
 *     is trusting whatever the response said — including a response from a stubbed transport, a
 *     future endpoint that forgets the gate, or a caller that passes a URL straight in.
 *
 * The rendered `src` is `checkCoverUrl`'s value, never the prop: that is the URL **as parsed**. A
 * check against one spelling followed by a render of another is not a check.
 *
 * The `alt` text is the drama title, so the placeholder still says which drama it belongs to. Why
 * the placeholder is there is on the element as `data-cover-rejection` — a refusal is otherwise
 * indistinguishable from a drama nobody uploaded artwork for, which is how a blocked host gets
 * triaged as a content-entry oversight. The attribute carries the rejection's name, never the
 * URL, so a refused `javascript:` payload does not get written into the DOM by the code that
 * refused it.
 *
 * `src` is nullable because a cover is a nullable field on the wire — `horizontalCoverUrl` always
 * was — and because the server reports a cover it refused as `null`. "Nothing renderable" is one
 * state, and this is it.
 */
export interface CoverImageProps {
  readonly src: string | null;
  readonly alt: string;
  readonly className?: string;
}

export function CoverImage({ src, alt, className }: CoverImageProps): React.JSX.Element {
  const checked = checkCoverUrl(src);
  const trusted = checked.ok ? checked.value : null;

  const [failed, setFailed] = useState(false);

  // A new src is a new chance to load. Without this, one broken cover would keep the placeholder
  // for whatever drama scrolls into the same position next. The dependency is the checked URL
  // rather than the prop, because that is the string the browser was asked to fetch: two spellings
  // of one URL are not a fresh chance, and two refused URLs are not either.
  useEffect(() => {
    setFailed(false);
  }, [trusted]);

  const classes = className === undefined ? 'cover' : `cover ${className}`;

  if (trusted === null || failed) {
    return (
      <div
        className={`${classes} cover--missing`}
        data-testid="cover-placeholder"
        data-cover-rejection={checked.ok ? undefined : checked.error}
        role="img"
        aria-label={alt}
      >
        <span className="cover__label">{translate('cover.missing')}</span>
      </div>
    );
  }

  return (
    <img
      className={classes}
      data-testid="cover-image"
      src={trusted}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
