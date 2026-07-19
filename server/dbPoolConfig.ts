type Environment = Record<string, string | undefined>;

export const SESSION_FALLBACK_POOL_DEFAULT_MAX = 4;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Sessions must not compete with article/content queries for the same
 * application-side pool when Redis is unavailable. The fallback pool stays
 * deliberately small and fails quickly so a Redis incident cannot occupy all
 * content connections.
 */
export function getSessionFallbackPoolConfig(
  databaseUrl: string,
  env: Environment = process.env,
) {
  return {
    connectionString: databaseUrl,
    application_name: "sabq-session-fallback",
    max: boundedInteger(
      env.SESSION_FALLBACK_POOL_MAX,
      SESSION_FALLBACK_POOL_DEFAULT_MAX,
      1,
      10,
    ),
    min: 0,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_500,
    allowExitOnIdle: true,
    maxUses: 1_000,
  };
}

/**
 * Database-changing maintenance is opt-in. The legacy skip flag remains an
 * emergency override for operational scripts that already set it.
 */
export function shouldRunStartupMaintenance(
  env: Environment = process.env,
): boolean {
  if (env.SKIP_DB_MAINTENANCE === "true") return false;
  return env.RUN_DB_STARTUP_MAINTENANCE === "true";
}
