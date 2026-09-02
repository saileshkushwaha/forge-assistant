/**
 * Tests for the auth-profile derivation helper.
 */

import { describe, test, expect } from 'bun:test';

import {
  resolveAuthProfile,
  type AssistantAuthProfile,
  type LockfileTopology,
} from '../assistant-auth-profile.js';

describe('resolveAuthProfile', () => {
  test('maps "local" to self-hosted', () => {
    const result = resolveAuthProfile({ cloud: 'local' });
    expect(result).toBe('self-hosted' satisfies AssistantAuthProfile);
  });

  test('maps "apple-container" to self-hosted', () => {
    const result = resolveAuthProfile({ cloud: 'apple-container' });
    expect(result).toBe('self-hosted' satisfies AssistantAuthProfile);
  });

  test('maps "forge" to forge-cloud', () => {
    const result = resolveAuthProfile({ cloud: 'forge' });
    expect(result).toBe('forge-cloud' satisfies AssistantAuthProfile);
  });

  test('maps legacy "platform" to forge-cloud', () => {
    const result = resolveAuthProfile({ cloud: 'platform' });
    expect(result).toBe('forge-cloud' satisfies AssistantAuthProfile);
  });

  test('unknown cloud value yields unsupported', () => {
    const result = resolveAuthProfile({ cloud: 'some-future-topology' });
    expect(result).toBe('unsupported' satisfies AssistantAuthProfile);
  });

  test('empty string yields unsupported', () => {
    const result = resolveAuthProfile({ cloud: '' });
    expect(result).toBe('unsupported' satisfies AssistantAuthProfile);
  });

  test('runtimeUrl presence does not affect the mapping', () => {
    const withUrl: LockfileTopology = { cloud: 'local', runtimeUrl: 'http://127.0.0.1:7831' };
    const withoutUrl: LockfileTopology = { cloud: 'local' };
    expect(resolveAuthProfile(withUrl)).toBe('self-hosted');
    expect(resolveAuthProfile(withoutUrl)).toBe('self-hosted');

    const cloudWithUrl: LockfileTopology = {
      cloud: 'forge',
      runtimeUrl: 'https://rt.forge.cloud',
    };
    const cloudWithoutUrl: LockfileTopology = { cloud: 'forge' };
    expect(resolveAuthProfile(cloudWithUrl)).toBe('forge-cloud');
    expect(resolveAuthProfile(cloudWithoutUrl)).toBe('forge-cloud');
  });

  test('is stable across all known cloud values', () => {
    const expected: Array<[string, AssistantAuthProfile]> = [
      ['local', 'self-hosted'],
      ['apple-container', 'self-hosted'],
      ['forge', 'forge-cloud'],
      ['platform', 'forge-cloud'],
    ];
    for (const [cloud, profile] of expected) {
      expect(resolveAuthProfile({ cloud })).toBe(profile);
    }
  });
});
