import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';

import { createUnresolvedViewerResolver } from '../entitlement/viewer-resolver.js';
import { requireViewer } from './viewer.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';

const accepting: ViewerResolver = { resolve: () => ok('user_a') };
const anonymous: ViewerResolver = { resolve: () => ok(null) };
const refusing: ViewerResolver = { resolve: () => err('SESSION_REJECTED') };

describe('requireViewer', () => {
  it('passes a resolved viewer through', () => {
    expect(requireViewer(accepting, 'Bearer tok')).toEqual({ ok: true, value: 'user_a' });
  });

  // The property this function exists for. An anonymous caller must not become a user id — least of
  // all a shared one, which is how every signed-out viewer ends up reading one history list.
  it('refuses an anonymous request rather than inventing a viewer', () => {
    expect(requireViewer(anonymous, undefined)).toEqual({ ok: false, error: 'NO_CREDENTIAL' });
  });

  it('passes the resolver’s own refusal through unchanged', () => {
    expect(requireViewer(refusing, 'Bearer tok')).toEqual({
      ok: false,
      error: 'SESSION_REJECTED',
    });
  });

  it('keeps the three failures apart, because they are different operator events', () => {
    const noCredential = requireViewer(createUnresolvedViewerResolver(), undefined);
    const notBearer = requireViewer(createUnresolvedViewerResolver(), 'Basic abc');
    const unresolvable = requireViewer(createUnresolvedViewerResolver(), 'Bearer tok');

    expect([noCredential, notBearer, unresolvable].map((result) => result.ok)).toEqual([
      false,
      false,
      false,
    ]);
    expect(new Set([noCredential, notBearer, unresolvable].map((r) => !r.ok && r.error))).toEqual(
      new Set(['NO_CREDENTIAL', 'SESSION_REJECTED', 'SESSION_UNRESOLVABLE']),
    );
  });
});
