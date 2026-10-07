import { setupDemoAdmin } from "../src/lib/demo-admin";
import { db } from "../src/lib/db";

try {
  await setupDemoAdmin();
  console.log("Administrator login ready: admin / admin123");
} finally {
  await db.$disconnect();
}
