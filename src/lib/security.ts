import { createHash } from "node:crypto";
import { db } from "./db";
import { AppError } from "./rules";
export async function rateLimit(key: string, max = 60, seconds = 60) {
  const hash = createHash("sha256").update(key).digest("hex");
  const now = new Date();
  const result = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" ("key","count","expiresAt") VALUES (${hash},1,${new Date(now.getTime() + seconds * 1000)}) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateLimit"."expiresAt" < ${now} THEN 1 ELSE "RateLimit"."count"+1 END, "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < ${now} THEN ${new Date(now.getTime() + seconds * 1000)} ELSE "RateLimit"."expiresAt" END RETURNING "count"`;
  if (result[0].count > max)
    throw new AppError("Too many requests. Please wait a minute.", 429);
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== new URL(process.env.BETTER_AUTH_URL || req.url).origin
  )
    throw new AppError("Cross-site request rejected.", 403);
}
export async function jsonBody(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 32768)
    throw new AppError("Request too large.", 413);
  const text = await req.text();
  if (text.length > 32768) throw new AppError("Request too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Invalid JSON.");
  }
}
