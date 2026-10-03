import { DEV_JWT_SECRET, resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret', () => {
  const silentLogger = { warn: jest.fn(), error: jest.fn() };

  beforeEach(() => { silentLogger.warn.mockClear(); silentLogger.error.mockClear(); });

  it('returns JWT_SECRET when set', () => {
    expect(resolveJwtSecret({ JWT_SECRET: 'real-secret' }, silentLogger)).toBe('real-secret');
    expect(silentLogger.error).not.toHaveBeenCalled();
  });

  it('refuses to boot in production without a secret', () => {
    // The old code silently used a hardcoded secret here, letting anyone with
    // the source mint a valid token.
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' }, silentLogger))
      .toThrow(/JWT_SECRET is required in production/);
    expect(silentLogger.error).toHaveBeenCalled();
  });

  it('falls back in development but warns loudly', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' }, silentLogger)).toBe(DEV_JWT_SECRET);
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  it('treats an empty-string secret as unset', () => {
    expect(resolveJwtSecret({ JWT_SECRET: '' }, silentLogger)).toBe(DEV_JWT_SECRET);
  });
});
