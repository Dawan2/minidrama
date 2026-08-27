import { useEffect, useState } from 'react';

import { translate } from '../core/i18n';

/**
 * A poster that degrades to a placeholder instead of a broken-image icon.
 *
 * This is not defensive decoration. Every `coverUrl` in the seed catalogue points at
 * `cdn.example.invalid`, which is not a registered trusted domain, so today *every* cover fails to
 * load (`docs/handoff/w2-work-d.md` §5). The same thing happens in production the first time an
 * image origin is missed in the Portal's trusted-domain list, and the failure mode there is a grid
 * of broken icons with no explanation. Handling `onError` turns that into a legible layout.
 *
 * The `alt` text is the drama title, so the placeholder still says which drama it belongs to.
 */
export interface CoverImageProps {
  readonly src: string;
  readonly alt: string;
  readonly className?: string;
}

export function CoverImage({ src, alt, className }: CoverImageProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);

  // A new src is a new chance to load. Without this, one broken cover would keep the placeholder
  // for whatever drama scrolls into the same position next.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const classes = className === undefined ? 'cover' : `cover ${className}`;

  if (failed) {
    return (
      <div
        className={`${classes} cover--missing`}
        data-testid="cover-placeholder"
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
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
