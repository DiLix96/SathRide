import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535.");

const addresses = [
  ...new Set(
    Object.values(networkInterfaces()).flatMap((entries) =>
      (entries || [])
        .filter((entry) => !entry.internal && entry.family === "IPv4")
        .map((entry) => entry.address),
    ),
  ),
];
if (!addresses.length)
  throw new Error("Connect this computer to Wi-Fi, then run dev:phone again.");
const origins = ["localhost", "127.0.0.1", ...addresses].map(
  (host) => `http://${host}:${port}`,
);

console.log("Connect your Android phone to the same Wi-Fi and open:");
for (const address of addresses) console.log(`  http://${address}:${port}`);
console.log(
  "Keep this terminal and the local database running. Restart after changing Wi-Fi.",
);
console.log("GPS and app installation require a trusted HTTPS deployment.");

const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--hostname",
    "0.0.0.0",
    "--port",
    String(port),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      SATHRIDE_LAN_ORIGINS: origins.join(","),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
