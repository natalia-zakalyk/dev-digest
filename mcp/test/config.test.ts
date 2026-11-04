import { describe, expect, it } from 'vitest';
import { assertLoopback, isLoopbackUrl, parseConfig } from '../src/config.js';
import { InvalidBaseUrl } from '../src/errors.js';

describe('loopback guard', () => {
  it.each([
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://[::1]:3001',
    'http://LOCALHOST:3001/',
  ])('accepts %s', (u) => expect(isLoopbackUrl(u)).toBe(true));

  it.each([
    'http://example.com',
    'http://192.168.1.5:3001',
    'http://localhost.evil.com',
    'http://127.0.0.1.evil.com',
    'http://evil.com/localhost',
    'http://localhost@evil.com',
    'not a url',
  ])('rejects %s', (u) => expect(isLoopbackUrl(u)).toBe(false));

  it('refuses a remote host with the spec message, unless DEVDIGEST_ALLOW_REMOTE=1', () => {
    expect(() => parseConfig({ DEVDIGEST_API_BASE: 'http://example.com' })).toThrow(InvalidBaseUrl);
    expect(() => parseConfig({ DEVDIGEST_API_BASE: 'http://example.com' })).toThrow(
      'DEVDIGEST_API_BASE must be a loopback address (localhost, 127.0.0.1, ::1). Set DEVDIGEST_ALLOW_REMOTE=1 to override.',
    );
    expect(parseConfig({ DEVDIGEST_API_BASE: 'http://example.com', DEVDIGEST_ALLOW_REMOTE: '1' }).baseUrl).toBe(
      'http://example.com',
    );
    expect(() => assertLoopback('http://example.com', false)).toThrow(InvalidBaseUrl);
  });

  it('only the exact value 1 allows remote', () => {
    expect(() => parseConfig({ DEVDIGEST_API_BASE: 'http://example.com', DEVDIGEST_ALLOW_REMOTE: 'true' })).toThrow(
      InvalidBaseUrl,
    );
  });
});

describe('base URL shape (scheme, credentials, query, hash)', () => {
  it.each([
    'ftp://localhost:3001',
    'file:///etc/passwd',
    'ws://localhost:3001',
    'http://user@localhost:3001',
    'http://user:secret@localhost:3001',
    'http://:secret@localhost:3001',
    'http://localhost:3001/?token=abc',
    'http://localhost:3001/api?x=1',
    'http://localhost:3001/#frag',
    'localhost:3001',
    'not a url',
  ])('rejects %s even with DEVDIGEST_ALLOW_REMOTE=1', (u) => {
    for (const allow of [undefined, '1']) {
      const err = (() => {
        try {
          parseConfig({ DEVDIGEST_API_BASE: u, DEVDIGEST_ALLOW_REMOTE: allow });
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(InvalidBaseUrl);
      expect((err as InvalidBaseUrl).reason).toBe('malformed');
      expect((err as Error).message).not.toContain('secret');
    }
  });

  it('accepts http and https with a path', () => {
    expect(parseConfig({ DEVDIGEST_API_BASE: 'http://localhost:3001/api/' }).baseUrl).toBe('http://localhost:3001/api');
    expect(
      parseConfig({ DEVDIGEST_API_BASE: 'https://example.com:8443', DEVDIGEST_ALLOW_REMOTE: '1' }).baseUrl,
    ).toBe('https://example.com:8443');
  });

  it('a non-loopback host keeps the loopback message and reason', () => {
    const err = (() => {
      try {
        parseConfig({ DEVDIGEST_API_BASE: 'http://example.com' });
      } catch (e) {
        return e as InvalidBaseUrl;
      }
    })();
    expect(err?.reason).toBe('not_loopback');
  });
});

describe('parseConfig', () => {
  it('defaults', () => {
    expect(parseConfig({})).toEqual({ baseUrl: 'http://localhost:3001', runWaitMs: 100_000 });
  });

  it('reads env and trims trailing slashes', () => {
    expect(parseConfig({ DEVDIGEST_API_BASE: 'http://127.0.0.1:4000//', MCP_RUN_WAIT_MS: '5000' })).toEqual({
      baseUrl: 'http://127.0.0.1:4000',
      runWaitMs: 5000,
    });
  });

  it.each(['abc', '0', '-5', '1.5', '1e3', '0x10', 'Infinity', '600001'])('rejects MCP_RUN_WAIT_MS=%s', (v) => {
    expect(() => parseConfig({ MCP_RUN_WAIT_MS: v })).toThrow(/MCP_RUN_WAIT_MS/);
  });

  it('treats empty values as unset', () => {
    expect(parseConfig({ DEVDIGEST_API_BASE: '', MCP_RUN_WAIT_MS: '' })).toEqual({
      baseUrl: 'http://localhost:3001',
      runWaitMs: 100_000,
    });
  });
});
