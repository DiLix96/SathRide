import { generateSeries } from "../src/lib/service";
import { db } from "../src/lib/db";
try {
  console.log(await generateSeries());
} finally {
  await db.$disconnect();
}
