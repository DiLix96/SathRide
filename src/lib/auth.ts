import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
import { deliver, deliveryAvailable } from "./providers";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32 ||
    process.env.BETTER_AUTH_SECRET.startsWith("replace-"))
)
  throw new Error("Set a strong BETTER_AUTH_SECRET for production.");
export const auth = betterAuth({
  logger: { disabled: true },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          if (process.env.NODE_ENV === "production") {
            const user = await db.user.findUnique({
              where: { id: session.userId },
            });
            if (user?.email.endsWith("@demo.sathride.test") || user?.suspended)
              throw new APIError("FORBIDDEN", {
                message: "This account is unavailable in production.",
              });
          }
          return { data: session };
        },
      },
    },
  },
  appName: "SathRide",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      if (!deliveryAvailable())
        throw new Error(
          "Password recovery unavailable: delivery provider is not configured.",
        );
      await deliver("password-recovery", user.email, url);
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7 },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    storage: "database",
    modelName: "authRateLimit",
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
});
