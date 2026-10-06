import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const url = new URL(process.env.DATABASE_URL!);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error("Local database requires a loopback DATABASE_URL.");
const databaseDir = resolve(".local-pg");
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: url.username,
  password: url.password,
  port: Number(url.port) || 5432,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: [
    "-h",
    "127.0.0.1",
    "-k",
    resolve(".local-pg"),
    "-c",
    "log_statement=none",
  ],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(resolve(databaseDir, "PG_VERSION")))
  await postgres.initialise();
await postgres.start();
const client = postgres.getPgClient();
await client.connect();
const name = url.pathname.slice(1);
if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error("Unsafe database name.");
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [name],
);
if (!result.rowCount) await postgres.createDatabase(name);
await client.end();
console.log(
  `Local PostgreSQL ready on 127.0.0.1:${url.port || 5432}. Keep this terminal open. Ctrl+C stops it.`,
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await postgres.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
