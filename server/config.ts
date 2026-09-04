/**
 * Centralised handling for secrets that must never fall back to a hardcoded
 * value in production.
 *
 * On Replit these had development defaults baked in, which meant a misconfigured
 * deployment would silently run with a publicly known session/JWT secret. In
 * production we now fail fast instead.
 */
export function requiredSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${name} must be set in production. Refusing to start with an insecure default.`,
    );
  }

  console.warn(
    `[config] ${name} is not set; using an insecure development default. ` +
      `This would be a fatal error with NODE_ENV=production.`,
  );
  return devFallback;
}
