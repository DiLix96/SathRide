import { hashPassword } from "better-auth/crypto";
import { db } from "./db";

export async function setupDemoAdmin() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demonstration admin setup is disabled in production.");
  const password = await hashPassword("admin123");
  await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: "admin@demo.sathride.test" },
      create: {
        id: "demo-admin",
        email: "admin@demo.sathride.test",
        name: "Demo Administrator",
        role: "ADMIN",
        profile: { create: { onboarded: true } },
      },
      update: { role: "ADMIN" },
    });
    await tx.account.upsert({
      where: {
        providerId_accountId: { providerId: "credential", accountId: user.id },
      },
      create: {
        id: "demo-account-admin",
        providerId: "credential",
        accountId: user.id,
        userId: user.id,
        password,
      },
      update: { password },
    });
  });
}
