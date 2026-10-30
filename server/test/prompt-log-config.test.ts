import { describe, it, expect } from 'vitest';
import { isLoopbackHost, loadConfig, resolvePromptLog } from '../src/platform/config.js';

/**
 * Prompt-assembly log gate (server/specs/prompt-assembly-logging.md).
 * Verbose/hash logging is a REQUEST that only takes effect in development on a loopback
 * bind; everything else must fail closed. Pure, no I/O.
 */
describe('isLoopbackHost', () => {
  it.each(['127.0.0.1', '127.1.2.3', 'localhost', 'LOCALHOST', '::1', '[::1]', ' 127.0.0.1 '])(
    'accepts loopback %j',
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each([
    ['0.0.0.0', 'wildcard bind'],
    ['::', 'IPv6 wildcard bind'],
    ['::ffff:127.0.0.1', 'IPv4-mapped IPv6 (not recognised, fail closed)'],
    ['127.1', 'short-form IPv4'],
    ['127.0.0.256', 'octet out of range'],
    ['localhost.evil.com', 'host that only starts with localhost'],
    ['127.0.0.1.nip.io', 'DNS name that starts with a loopback literal'],
    ['', 'empty host'],
    ['   ', 'blank host'],
    ['192.168.1.5', 'LAN address'],
    ['example.com', 'public name'],
  ])('rejects %j (%s)', (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe('resolvePromptLog', () => {
  it('development + loopback: verbose on when requested', () => {
    expect(resolvePromptLog('development', '127.0.0.1', 'true', undefined)).toEqual({
      verbose: true,
      hashes: false,
      ignored: null,
      requested: true,
    });
  });

  it('development + loopback: hashes need verbose', () => {
    expect(resolvePromptLog('development', '127.0.0.1', 'true', 'true')).toMatchObject({ verbose: true, hashes: true });
    // Hashes alone: requested, but never effective.
    expect(resolvePromptLog('development', '127.0.0.1', undefined, 'true')).toEqual({
      verbose: false,
      hashes: false,
      ignored: null,
      requested: true,
    });
  });

  it('nothing requested: everything off, nothing ignored', () => {
    expect(resolvePromptLog('development', '127.0.0.1', undefined, undefined)).toEqual({
      verbose: false,
      hashes: false,
      ignored: null,
      requested: false,
    });
  });

  it.each(['0.0.0.0', '::', '::ffff:127.0.0.1', '127.1', 'localhost.evil.com', '127.0.0.1.nip.io', ''])(
    'development + non-loopback host %j: off with ignored=non_loopback_host',
    (host) => {
      expect(resolvePromptLog('development', host, 'true', 'true')).toEqual({
        verbose: false,
        hashes: false,
        ignored: 'non_loopback_host',
        requested: true,
      });
    },
  );

  it('non-loopback host without a request is not reported as ignored', () => {
    expect(resolvePromptLog('development', '0.0.0.0', undefined, undefined).ignored).toBeNull();
  });

  it.each(['production', 'test'] as const)('%s is always off, even on loopback, and reports why', (env) => {
    expect(resolvePromptLog(env, '127.0.0.1', 'true', 'true')).toEqual({
      verbose: false,
      hashes: false,
      ignored: env,
      requested: true,
    });
    expect(resolvePromptLog(env, '127.0.0.1', undefined, undefined).ignored).toBeNull();
  });

  it.each(['TRUE', 'True', '1', 'yes', ' true', 'false', ''])('env value %j does not enable verbose or hashes', (raw) => {
    const r = resolvePromptLog('development', '127.0.0.1', raw, raw);
    expect(r.verbose).toBe(false);
    expect(r.hashes).toBe(false);
    expect(r.requested).toBe(false);
  });
});

describe('loadConfig → promptLog', () => {
  it('defaults to off with a loopback host', () => {
    const c = loadConfig({});
    expect(c.host).toBe('127.0.0.1');
    expect(c.promptLog).toEqual({ verbose: false, hashes: false, ignored: null, requested: false });
  });

  it('turns on in development on the default host', () => {
    const c = loadConfig({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true', PROMPT_LOG_HASHES: 'true' });
    expect(c.promptLog).toMatchObject({ verbose: true, hashes: true, ignored: null });
  });

  it('API_HOST=0.0.0.0 refuses verbose', () => {
    const c = loadConfig({ NODE_ENV: 'development', API_HOST: '0.0.0.0', PROMPT_LOG_VERBOSE: 'true' });
    expect(c.promptLog).toMatchObject({ verbose: false, hashes: false, ignored: 'non_loopback_host' });
  });

  it('empty strings from .env are treated as unset (and an empty API_HOST falls back to loopback)', () => {
    const c = loadConfig({ API_HOST: '', PROMPT_LOG_VERBOSE: '', PROMPT_LOG_HASHES: '' });
    expect(c.promptLog).toEqual({ verbose: false, hashes: false, ignored: null, requested: false });
  });

  it('production ignores the request', () => {
    const c = loadConfig({ NODE_ENV: 'production', PROMPT_LOG_VERBOSE: 'true' });
    expect(c.promptLog).toMatchObject({ verbose: false, ignored: 'production' });
  });
});
