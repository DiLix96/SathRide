// The phone launcher supplies exact local origins; production ignores them.
export function accessOrigins(env: NodeJS.ProcessEnv = process.env) {
  const canonical = env.BETTER_AUTH_URL
    ? new URL(env.BETTER_AUTH_URL).origin
    : undefined;
  const local =
    env.NODE_ENV === "development"
      ? (env.SATHRIDE_LAN_ORIGINS || "").split(",").filter(Boolean)
      : [];
  return [...new Set([...(canonical ? [canonical] : []), ...local])];
}

export function authBaseURL(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "development" && env.SATHRIDE_LAN_ORIGINS) {
    return {
      allowedHosts: accessOrigins(env).map((origin) => new URL(origin).host),
      fallback: env.BETTER_AUTH_URL,
      protocol: "http" as const,
    };
  }
  return env.BETTER_AUTH_URL;
}
