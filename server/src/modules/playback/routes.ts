import type { FastifyInstance } from 'fastify';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { errorBody } from '../../core/errors.js';

/**
 * Playback session issuance.
 *
 * The response is a playback *descriptor*, never a signed media URL (correction A4 in
 * `docs/architecture/system-overview.md` §1.1). Two authorization systems sit in series and this
 * endpoint owns only the commercial one: it can deny playback, it can never grant it. The
 * platform independently enforces moderation, online version, listing state and client
 * authorization, and can still refuse an episode this endpoint approved.
 *
 * Wave 1 ships the contract and the deny path. Wave 2 replaces the stub entitlement check with
 * the real `entitlement` module and adds the lazy `play_auth_token` fetch for clients below
 * TikTok 44.5.0.
 */

interface CreateSessionBody {
  readonly episodeId?: unknown;
}

/** Stub entitlement rule, deliberately explicit so tests exercise a real deny path. */
function isEntitled(episodeId: string): boolean {
  return !episodeId.startsWith('ep_locked');
}

export async function playbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/playback/sessions', async (request, reply) => {
    const body = request.body as CreateSessionBody | undefined;
    const episodeId = body?.episodeId;

    if (typeof episodeId !== 'string' || episodeId.length === 0) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'episodeId is required', request.id, {
          fields: [{ field: 'episodeId', reason: 'required' }],
        }),
      );
    }

    if (!isEntitled(episodeId)) {
      // A commercial lock is a conversion opportunity, so it carries unlock context. It must
      // never be reported with the same code as a platform block, which is an incident.
      return reply.status(403).send(
        errorBody('EPISODE_LOCKED', 'This episode is not unlocked', request.id, {
          episodeId,
          unlockOptions: ['COINS', 'AD', 'VIP'],
        }),
      );
    }

    const descriptor: PlaybackDescriptor = {
      albumId: 'album_demo_0001',
      episodeId,
      vid: 'vid_demo_0001',
      resumePositionSec: 0,
    };

    return reply.status(201).send(descriptor);
  });
}
