/**
 * Resolves the service-role (admin) key for server-side clients.
 *
 * Supports both formats:
 *  - Legacy:  SUPABASE_SERVICE_ROLE_KEY=<legacy-service-role-jwt>
 *  - New:     SUPABASE_SECRET_KEYS={"default":"sb_secret_...","other":"..."}
 *
 * New `sb_secret_...` keys are provided as a JSON object keyed by name,
 * so we parse it and prefer the "default" entry, falling back to the first value.
 */

type SecretKeysMap = Record<string, string>;

export function getServiceRoleKey(): string | null {
  const secretKeysRaw = process.env.SUPABASE_SECRET_KEYS;
  if (secretKeysRaw) {
    try {
      const keys = JSON.parse(secretKeysRaw) as SecretKeysMap;
      if (keys && typeof keys === 'object') {
        if (typeof keys.default === 'string' && keys.default) return keys.default;
        const first = Object.values(keys).find(
          (v): v is string => typeof v === 'string' && v.length > 0,
        );
        if (first) return first;
      }
    } catch {
      // malformed JSON — fall through to the legacy env var
    }
  }

  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return legacy && legacy.length > 0 ? legacy : null;
}
