import { Logger } from '@nestjs/common';

/**
 * Resolve the JWT signing secret.
 *
 * In production a missing JWT_SECRET is fatal. The previous code fell back to a
 * hardcoded default string, which meant a production deploy with a missing env
 * var would sign tokens with a secret published in the source — letting anyone
 * mint a valid token for any user.
 *
 * Extracted as a pure function so it can be unit tested without booting Nest.
 */
export const DEV_JWT_SECRET = 'genesis-erp-dev-secret-change-in-production';

export function resolveJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
  logger: Pick<Logger, 'warn' | 'error'> = Logger,
): string {
  const secret = env.JWT_SECRET;
  if (secret) return secret;

  if (env.NODE_ENV === 'production') {
    logger.error?.('JWT_SECRET is required in production. Refusing to start.', 'JwtSecret');
    throw new Error('JWT_SECRET is required in production');
  }

  logger.warn?.('JWT_SECRET not set — using the development fallback secret.', 'JwtSecret');
  return DEV_JWT_SECRET;
}