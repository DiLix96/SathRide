import EmbeddedPostgres from "embedded-postgres";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const url = new URL(process.env.DATABASE_URL!);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error("CI requires a local, disposable database.");
const postgres = new EmbeddedPostgres({
  databaseDir: resolve(".ci-pg"),
  user: url.username,
  password: url.password,
  port: Number(url.port) || 5432,
  persistent: false,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
});
function run(task: string) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath!, "run", task], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${task} failed (${result.status}).`);
}
let server: ReturnType<typeof spawn> | undefined;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(url.pathname.slice(1));
  for (const task of ["db:generate", "db:migrate", "db:seed", "lint", "typecheck", "test", "build"])
    run(task);
  // Demo accounts require development mode for the workflow tests.
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Development server stopped before readiness.");
    try {
      const response = await fetch("http://localhost:3000/login", { signal: AbortSignal.timeout(2000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Retry while Next.js starts. */ }
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (!ready) throw new Error("Development server did not become ready.");
  run("test:integration");
  run("test:browser");
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise<void>((done) => server!.once("exit", () => done()));
    if (process.platform === "win32") {
      // Next.js starts a child process; stop the whole tree on Windows.
      const result = spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
        stdio: "inherit",
      });
      if (result.error || result.status !== 0) server.kill("SIGTERM");
    } else {
      server.kill("SIGTERM");
    }
    await exited;
  }
  await postgres.stop();
}
