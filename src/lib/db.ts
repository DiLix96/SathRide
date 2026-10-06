import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDB = globalThis as unknown as { db?: PrismaClient };
export const db =
  globalDB.db ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      max: 10,
    }),
  });
if (process.env.NODE_ENV !== "production") globalDB.db = db;
