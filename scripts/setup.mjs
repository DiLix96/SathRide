import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("Install Node.js 24 LTS before setting up SathRide.");
if (!existsSync(".env")) {
  const template = readFileSync(".env.example", "utf8");
  writeFileSync(
    ".env",
    template.replace("replace-with-at-least-32-random-characters", randomBytes(32).toString("hex")),
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created .env with a unique authentication secret.");
}
if (process.argv.includes("--env-only")) process.exit(0);
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!process.argv.includes("--no-docker")) {
  console.log("Starting PostgreSQL. Docker Desktop must be running on Windows.");
  run("docker", ["compose", "up", "-d", "--wait", "db"]);
}
for (const task of ["db:generate", "db:migrate", "db:seed"])
  run(process.execPath, [process.env.npm_execpath, "run", task]);
console.log("Setup complete. Run npm run dev and open http://localhost:3000.");
