import { describe, it, expect } from "vitest";
import {
  eligible,
  phonePK,
  matchRoute,
  journeyDates,
  shareValid,
  distance,
  rideSchema,
} from "../src/lib/rules";
const a = { lat: 33.6, lng: 73.05 },
  b = { lat: 33.7, lng: 73.05 },
  when = new Date("2026-10-08T03:00:00Z");
describe("Pakistan onboarding", () => {
  it.each(["03001234567", "+923001234567", "00923001234567", "92 300 1234567"])(
    "normalizes %s",
    (n) => expect(phonePK(n)).toBe("+923001234567"),
  );
  it("rejects invalid country and malformed mobile numbers", () => {
    expect(() => phonePK("+14155551234")).toThrow();
    expect(() => phonePK("0300")).toThrow();
  });
});
describe("eligibility", () => {
  it.each(["MALE", "FEMALE", "UNDISCLOSED"])("permits %s for mixed", (g) =>
    expect(eligible("MIXED", g)).toBe(true),
  );
  it("enforces both restricted preferences", () => {
    expect(eligible("FEMALE_ONLY", "MALE")).toBe(false);
    expect(eligible("MALE_ONLY", "FEMALE")).toBe(false);
    expect(eligible("FEMALE_ONLY", "UNDISCLOSED")).toBe(false);
    expect(eligible("FEMALE_ONLY", "FEMALE")).toBe(true);
  });
});
describe("geographic matching", () => {
  it("matches ordered pickup and drop-off with deterministic reasons", () => {
    const r = matchRoute(
      [a, b],
      { lat: 33.62, lng: 73.056 },
      { lat: 33.68, lng: 73.054 },
      new Date(when.getTime() + 10 * 60000),
      when,
      30,
    );
    expect(r?.minutes).toBe(10);
    expect(r?.pickupMetres).toBeGreaterThan(400);
    expect(r?.pickupMetres).toBeLessThan(700);
    expect(r?.score).toBeGreaterThan(50);
  });
  it("rejects the wrong direction", () =>
    expect(matchRoute([b, a], a, b, when, when, 60)).toBeNull());
  it("rejects incompatible time", () =>
    expect(
      matchRoute([a, b], a, b, new Date(when.getTime() + 61 * 60000), when, 60),
    ).toBeNull());
  it("rejects locations outside 2 km", () =>
    expect(
      matchRoute([a, b], { lat: 31, lng: 74 }, b, when, when, 60),
    ).toBeNull());
  it("rejects zero-length pickup/drop-off progress", () =>
    expect(matchRoute([a, b], a, a, when, when, 60)).toBeNull());
  it("measures metres rather than a random city score", () =>
    expect(distance(a, b)).toBeCloseTo(11119, 0));
});
describe("journey dates and share links", () => {
  it("uses Pakistan weekdays and UTC timestamps deterministically", () => {
    const now = new Date("2026-10-06T22:00:00Z");
    const dates = journeyDates("08:00", [3], 7, now);
    expect(dates[0].toISOString()).toBe("2026-10-07T03:00:00.000Z");
    expect(journeyDates("08:00", [3], 7, now)).toEqual(dates);
  });
  it("never generates departed dates", () =>
    expect(
      journeyDates("01:00", [3], 1, new Date("2026-10-06T22:00:00Z")),
    ).toHaveLength(0));
  it.each(["COMPLETED", "CANCELLED"])("expires on %s", (status) =>
    expect(
      shareValid({
        revoked: false,
        expiresAt: new Date(Date.now() + 10000),
        ride: { status },
      }),
    ).toBe(false),
  );
  it("enforces expiry and revocation", () => {
    expect(
      shareValid({
        revoked: true,
        expiresAt: new Date(Date.now() + 10000),
        ride: { status: "SCHEDULED" },
      }),
    ).toBe(false);
    expect(
      shareValid({
        revoked: false,
        expiresAt: new Date(Date.now() - 1),
        ride: { status: "SCHEDULED" },
      }),
    ).toBe(false);
  });
  it("rejects malformed ride capacity and contribution", () =>
    expect(rideSchema.safeParse({ capacity: 0, price: -1 }).success).toBe(
      false,
    ));
});
