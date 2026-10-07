import { devices, expect, test } from "@playwright/test";

test("administrator can sign in with admin and admin123", async ({
  browser,
}) => {
  const baseURL = process.env.PHONE_URL || "http://localhost:3000";
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email address or username").fill("admin");
    await page.getByLabel("Password", { exact: true }).fill("admin123");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /Assalam-o-Alaikum/ }),
    ).toBeVisible();
    const me = await context.request.get("/api/me");
    expect((await me.json()).role).toBe("ADMIN");
    expect((await context.request.get("/api/admin")).ok()).toBe(true);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Administration", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Verification queue" }),
    ).toBeVisible();
    await context.request.post("/api/auth/sign-out", {
      headers: { origin: baseURL },
      data: {},
    });
  } finally {
    await context.close();
  }
});

test("Android access supports login and API origin checks", async ({
  browser,
}) => {
  const baseURL = process.env.PHONE_URL || "http://localhost:3000";
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email address").fill("bilal@demo.sathride.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("SathRideDemo!2026");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /Assalam-o-Alaikum/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect((await context.request.get("/api/me")).ok()).toBe(true);
    const accepted = await context.request.post("/api/capabilities", {
      headers: { origin: baseURL },
      data: {},
    });
    expect(accepted.ok()).toBe(true);
    const rejected = await context.request.post("/api/capabilities", {
      headers: { origin: "https://untrusted.example" },
      data: {},
    });
    expect(rejected.status()).toBe(403);
    expect(
      (
        await context.request.post("/api/auth/sign-out", {
          headers: { origin: baseURL },
          data: {},
        })
      ).ok(),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
