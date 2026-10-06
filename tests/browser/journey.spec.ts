import { test, expect } from "@playwright/test";
test("mobile login, search, request and driver acceptance", async ({
  browser,
  request,
}) => {
  const login = await request.post("/api/auth/sign-in/email", {
    headers: { origin: "http://localhost:3000" },
    data: { email: "hamza@demo.sathride.test", password: "SathRideDemo!2026" },
  });
  expect(login.ok()).toBe(true);
  const response = await request.post("/api/rides", {
    headers: { origin: "http://localhost:3000" },
    data: {
      vehicleId: "demo-vehicle-hamza",
      pickup: "Browser test pickup",
      destination: "Browser test destination",
      points: [
        { lat: 33.5973, lng: 73.0528 },
        { lat: 33.6509, lng: 73.0833 },
        { lat: 33.6667, lng: 73.045 },
      ],
      departure: new Date(Date.now() + 86400000).toISOString(),
      capacity: 2,
      price: 220,
      preference: "MIXED",
    },
  });
  expect(response.ok()).toBe(true);
  const ride = await response.json();
  try {
    const passenger = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      p = await passenger.newPage();
    await p.goto("/login");
    await p.getByLabel("Email address").fill("bilal@demo.sathride.test");
    await p.getByLabel("Password", { exact: true }).fill("SathRideDemo!2026");
    await p.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: /Assalam-o-Alaikum/ }),
    ).toBeVisible();
    await p.goto("/find");
    await p.getByRole("button", { name: "Find matching rides" }).click();
    await expect(
      p.getByRole("heading", { name: /compatible ride/ }),
    ).toBeVisible();
    await expect(
      p.getByText("Pickup approximately", { exact: false }).first(),
    ).toBeVisible();
    await p.goto(`/rides/${ride.id}`);
    const seats = p.getByRole("button", { name: "Request seats" });
    await seats.click();
    await expect(
      p.getByText("Booking pending", { exact: false }),
    ).toBeVisible();
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const driver = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      d = await driver.newPage();
    await d.goto("/login");
    await d.getByLabel("Email address").fill("hamza@demo.sathride.test");
    await d.getByLabel("Password", { exact: true }).fill("SathRideDemo!2026");
    await d.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(
      d.getByRole("heading", { name: /Assalam-o-Alaikum/ }),
    ).toBeVisible();
    await d.goto(`/rides/${ride.id}`);
    const row = d.locator(".list-item").filter({ hasText: "Bilal Naveed" });
    const accept = row.getByRole("button", { name: "Accept", exact: true });
    await accept.click();
    await expect(row.getByText(/accepted/)).toBeVisible();
    await p.reload();
    await expect(
      p.getByText("Booking accepted", { exact: false }),
    ).toBeVisible();
    await p.getByRole("link", { name: "Booking conversation" }).click();
    await p
      .getByLabel("Message", { exact: true })
      .fill("Browser test: pickup confirmed.");
    await p.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      p.getByText("Browser test: pickup confirmed.", { exact: true }),
    ).toBeVisible();
    await p.goto(`/rides/${ride.id}`);
    p.on("dialog", (dialog) => dialog.accept());
    await p
      .getByRole("button", { name: "Cancel booking", exact: true })
      .click();
    await expect(
      p.getByText("Booking cancelled", { exact: false }),
    ).toBeVisible();
    await passenger.close();
    await driver.close();
  } finally {
    const cancelled = await request.post(`/api/rides/${ride.id}/cancel`, {
      headers: { origin: "http://localhost:3000" },
      data: {},
    });
    expect(cancelled.ok()).toBe(true);
  }
});
test("registration leads to role and profile onboarding", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Browser Demo User");
  await page
    .getByLabel("Email address")
    .fill(`browser-${Date.now()}@sathride.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("BrowserPassword!2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "How will you ride?" }),
  ).toBeVisible();
  await page.getByLabel("Find a ride").check();
  await page.getByRole("button", { name: "Continue to profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Make yourself at home" }),
  ).toBeVisible();
});
