import { afterEach, describe, expect, it, vi } from "vitest";
import { accessOrigins, authBaseURL } from "../src/lib/access";
import { checkOrigin } from "../src/lib/security";

vi.mock("../src/lib/db", () => ({ db: {} }));
afterEach(() => vi.unstubAllEnvs());

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  BETTER_AUTH_URL: "http://localhost:3000",
  SATHRIDE_LAN_ORIGINS: "http://localhost:3000,http://192.168.0.107:3000",
};
describe("phone access", () => {
  it("allows exact local hosts for request-specific authentication URLs", () => {
    expect(accessOrigins(env)).toEqual([
      "http://localhost:3000",
      "http://192.168.0.107:3000",
    ]);
    expect(authBaseURL(env)).toEqual({
      allowedHosts: ["localhost:3000", "192.168.0.107:3000"],
      fallback: "http://localhost:3000",
      protocol: "http",
    });
  });
  it("accepts phone mutations while rejecting unlisted sites and ports", () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const request = (origin: string) =>
      new Request("http://192.168.0.107:3000/api/rides", {
        method: "POST",
        headers: { origin },
      });
    expect(() =>
      checkOrigin(request("http://192.168.0.107:3000")),
    ).not.toThrow();
    expect(() => checkOrigin(request("http://localhost:3000"))).not.toThrow();
    for (const origin of [
      "https://evil.example",
      "http://192.168.0.108:3000",
      "http://192.168.0.107:3001",
    ])
      expect(() => checkOrigin(request(origin))).toThrow(
        "Cross-site request rejected.",
      );
  });
  it("ignores local phone origins in production", () => {
    const production: NodeJS.ProcessEnv = {
      ...env,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://rides.example",
    };
    expect(accessOrigins(production)).toEqual(["https://rides.example"]);
    expect(authBaseURL(production)).toBe("https://rides.example");
    for (const [key, value] of Object.entries(production))
      vi.stubEnv(key, value);
    expect(() =>
      checkOrigin(
        new Request("https://rides.example/api/rides", {
          method: "POST",
          headers: { origin: "http://192.168.0.107:3000" },
        }),
      ),
    ).toThrow("Cross-site request rejected.");
  });
});
