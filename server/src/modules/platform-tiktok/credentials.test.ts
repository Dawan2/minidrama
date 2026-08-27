import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { createPlatformCredentials, loadPlatformCredentials } from './credentials.js';

const SECRET = 'sk-do-not-log-this-value';

describe('loadPlatformCredentials', () => {
  it('reads the pair from the environment', () => {
    const credentials = loadPlatformCredentials({
      TIKTOK_CLIENT_KEY: 'awtest',
      TIKTOK_CLIENT_SECRET: SECRET,
    });

    expect(credentials.clientKey).toBe('awtest');
    expect(credentials.hasClientSecret).toBe(true);
    expect(credentials.signingKey()).toBe(SECRET);
  });

  it('reports an absent secret rather than inventing one', () => {
    const credentials = loadPlatformCredentials({ TIKTOK_CLIENT_KEY: 'awtest' });

    expect(credentials.hasClientSecret).toBe(false);
    expect(credentials.signingKey()).toBe('');
  });

  it('treats an empty secret as absent', () => {
    expect(loadPlatformCredentials({ TIKTOK_CLIENT_SECRET: '' }).hasClientSecret).toBe(false);
  });
});

// The secret lives in a closure, so these are properties of the shape rather than of a redaction
// list that has to anticipate every logger.
describe('the secret is unreachable by accident', () => {
  const credentials = createPlatformCredentials('awtest', SECRET);

  it('does not appear in JSON', () => {
    expect(JSON.stringify(credentials)).not.toContain(SECRET);
  });

  it('does not appear in an inspected or interpolated form', () => {
    expect(inspect(credentials, { depth: 5 })).not.toContain(SECRET);
    expect(`${JSON.stringify({ ...credentials })}`).not.toContain(SECRET);
  });

  it('is not an own property of the object', () => {
    expect(Object.values(credentials)).not.toContain(SECRET);
    expect(Object.keys(credentials)).toEqual(['clientKey', 'hasClientSecret', 'signingKey']);
  });

  it('is still readable by the one caller that needs it', () => {
    expect(credentials.signingKey()).toBe(SECRET);
  });
});
