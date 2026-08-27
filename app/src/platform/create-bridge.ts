import { MockBridge } from './mock-bridge';
import { TikTokBridge } from './tiktok-bridge';
import { resolveSdkNamespace } from './sdk';
import type { PlatformBridge } from './types';

/**
 * Picks the bridge implementation for the current runtime.
 *
 * Presence of the SDK global is the discriminator, not a build flag: the same artifact runs in a
 * plain browser during development and inside TikTok in production, and a build flag would let
 * those two drift apart.
 */
export function createBridge(clientKey: string): PlatformBridge {
  return resolveSdkNamespace() === null ? new MockBridge() : new TikTokBridge(clientKey);
}
