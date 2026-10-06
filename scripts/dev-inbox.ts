import { db } from "../src/lib/db";
import { simulation } from "../src/lib/providers";
if (!simulation())
  throw new Error("Development inbox is unavailable in production.");
const email = process.argv[2];
if (!email) throw new Error("Usage: npm run dev:inbox -- email");
try {
  const items = await db.devDelivery.findMany({
    where: { to: email, createdAt: { gt: new Date(Date.now() - 15 * 60000) } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  for (const item of items)
    console.log(`LOCAL SIMULATION ONLY (${item.kind}): ${item.text}`);
  if (!items.length)
    console.log("No recent simulated delivery for that address.");
} finally {
  await db.$disconnect();
}
