import type { ConfigView } from '@minidrama/shared';

import { resolveClientConfig } from '../data/config-api';
import type { ConfigApi } from '../data/config-api';

/**
 * Fetch `GET /v1/config` and fall back to the conservative defaults. Boot calls this after
 * silent login so a hung config cannot outlive the splash without a number.
 */
export async function loadBootConfig(api: ConfigApi): Promise<ConfigView> {
  return resolveClientConfig(await api.fetchConfig());
}
