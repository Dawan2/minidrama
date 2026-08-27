import { describe, expect, it } from 'vitest';

import {
  MOCK_AUTH_CODE_PREFIX,
  TEST_LOGIN_ENABLE_VALUE,
  createMockIdentityPort,
  isTestLoginEnabled,
  mockAuthCode,
} from './test-login.js';
import { loadConfig } from '../../config.js';

/**
 * The gate is the security control in this slot, so it is tested as one: the enumeration below is
 * the set of ways somebody could plausibly end up with mock login live in production, and every one
 * of them must refuse.
 */

const ENABLED = { MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE, NODE_ENV: 'test' };

describe('the mock login gate', () => {
  it('is off for an environment that says nothing', () => {
    expect(isTestLoginEnabled({})).toBe(false);
  });

  it('opens only when both conditions hold', () => {
    expect(isTestLoginEnabled(ENABLED)).toBe(true);
    expect(
      isTestLoginEnabled({
        MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE,
        NODE_ENV: 'development',
      }),
    ).toBe(true);
  });

  // The flag is a sentence, not a boolean, so the habits that enable every other flag do not
  // enable this one.
  it.each(['true', '1', 'yes', 'on', 'enabled', '', ' ', TEST_LOGIN_ENABLE_VALUE.toUpperCase()])(
    'stays off for the flag value %o',
    (value) => {
      expect(isTestLoginEnabled({ MINIDRAMA_TEST_LOGIN: value, NODE_ENV: 'test' })).toBe(false);
    },
  );

  // `NODE_ENV` is an allowlist. A blocklist would make "forgot to set NODE_ENV" the enabling
  // condition, which is exactly backwards.
  it.each(['production', 'staging', 'prod', 'Test', 'testing', ''])(
    'stays off in NODE_ENV %o even with the flag set',
    (nodeEnv) => {
      expect(
        isTestLoginEnabled({ MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE, NODE_ENV: nodeEnv }),
      ).toBe(false);
    },
  );

  it('stays off when NODE_ENV is absent entirely', () => {
    expect(isTestLoginEnabled({ MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE })).toBe(false);
  });

  it('is not affected by the presence of real platform credentials', () => {
    // Recorded rather than asserted as a safeguard: credentials are not part of the gate, so a
    // credentialled non-production deployment can still run mock login. The two conditions above
    // are what keeps it out of production.
    expect(
      isTestLoginEnabled({
        ...ENABLED,
        TIKTOK_CLIENT_KEY: 'awtest',
        TIKTOK_CLIENT_SECRET: 'secret',
      }),
    ).toBe(true);
  });

  it('reaches the config the server actually reads', () => {
    expect(loadConfig({}).testLoginEnabled).toBe(false);
    expect(loadConfig(ENABLED).testLoginEnabled).toBe(true);
  });
});

describe('the mock identity port', () => {
  const port = createMockIdentityPort();

  it('exchanges a mock code for the user id it names', async () => {
    expect(await port.exchangeAuthCode(mockAuthCode('usr_fx_vip_active'))).toEqual({
      ok: true,
      value: { openId: 'usr_fx_vip_active' },
    });
  });

  // Even enabled, it is not an open door: a real TikTok authorization code arriving here is refused,
  // so a client that has been pointed at a mock deployment by mistake does not silently log in.
  it.each(['', 'code_abc', 'act.example12345', MOCK_AUTH_CODE_PREFIX, 'MOCK:usr_abc'])(
    'refuses the code %o',
    async (code) => {
      expect(await port.exchangeAuthCode(code)).toEqual({ ok: false, error: 'AUTH_CODE_REJECTED' });
    },
  );

  // A user id is an opaque identifier, not a place to put a payload.
  it.each([
    'mock:usr with spaces',
    'mock:usr/../../etc',
    'mock:usr:extra',
    `mock:${'u'.repeat(65)}`,
  ])('refuses the malformed code %o', async (code) => {
    expect(await port.exchangeAuthCode(code)).toEqual({ ok: false, error: 'AUTH_CODE_REJECTED' });
  });

  it('is the only failure it can report, so it cannot be read as a provider outage', async () => {
    const refused = await port.exchangeAuthCode('code_abc');

    expect(refused).toEqual({ ok: false, error: 'AUTH_CODE_REJECTED' });
  });
});
