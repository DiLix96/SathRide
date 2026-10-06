import { z } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const assert = (
  ok: unknown,
  message: string,
  status = 400,
): asserts ok => {
  if (!ok) throw new AppError(message, status);
};
export const eligible = (preference: string, gender: string) =>
  preference === "MIXED" ||
  (preference === "FEMALE_ONLY" && gender === "FEMALE") ||
  (preference === "MALE_ONLY" && gender === "MALE");
export function phonePK(value: string) {
  const s = value.replace(/[\s()-]/g, "");
  const normalized = s.startsWith("0092")
    ? `+92${s.slice(4)}`
    : s.startsWith("0")
      ? `+92${s.slice(1)}`
      : s.startsWith("92")
        ? `+${s}`
        : s;
  if (!/^\+923\d{9}$/.test(normalized))
    throw new AppError("Enter a Pakistan mobile number, such as 0300 1234567.");
  return normalized;
}
export const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const preferenceSchema = z.enum(["FEMALE_ONLY", "MALE_ONLY", "MIXED"]);
export const rideSchema = z.object({
  vehicleId: z.string().min(1),
  pickup: z.string().trim().min(3).max(120),
  destination: z.string().trim().min(3).max(120),
  points: z.array(pointSchema).min(2).max(12),
  departure: z.iso.datetime(),
  capacity: z.number().int().min(1).max(12),
  price: z.number().int().min(1).max(100000),
  preference: preferenceSchema,
  luggage: z.string().max(120).default("Small bag"),
  smoking: z.boolean().default(false),
  notes: z.string().max(1000).default(""),
  communityId: z.string().optional(),
});
export const searchSchema = z.object({
  pickup: pointSchema,
  destination: pointSchema,
  departure: z.iso.datetime(),
  flexibility: z.number().min(0).max(720),
  seats: z.number().int().min(1).max(12),
  preference: preferenceSchema,
  maxPrice: z.number().min(1).optional(),
  communityId: z.string().optional(),
  verified: z.boolean().optional(),
});
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  role: z.enum(["PASSENGER", "DRIVER", "BOTH"]),
  phone: z.string().transform(phonePK),
  city: z.string().min(2).max(80),
  gender: z.enum(["FEMALE", "MALE", "UNDISCLOSED"]),
  institution: z.string().max(120).optional(),
  bio: z.string().max(500),
  emergencyName: z.string().max(80).optional(),
  emergencyPhone: z
    .string()
    .optional()
    .transform((v) => (v ? phonePK(v) : null)),
  preference: preferenceSchema,
  image: z
    .union([
      z.literal(""),
      z
        .url()
        .refine((s) => s.startsWith("https://"), "Use an HTTPS image URL."),
    ])
    .optional(),
});
export const vehicleSchema = z.object({
  make: z.string().min(2).max(40),
  model: z.string().min(1).max(40),
  colour: z.string().min(2).max(30),
  registration: z.string().min(3).max(30),
  seats: z.number().int().min(1).max(12),
});
export type Point = z.infer<typeof pointSchema>;
const rad = (n: number) => (n * Math.PI) / 180;
export function distance(a: Point, b: Point) {
  const dlat = rad(b.lat - a.lat),
    dlng = rad(b.lng - a.lng);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
// Local equirectangular projection per segment; sufficient for urban commutes.
export function project(p: Point, route: Point[]) {
  let best = { distance: Infinity, along: 0 },
    offset = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i],
      b = route[i + 1];
    const cos = Math.cos(rad((a.lat + b.lat) / 2));
    const x = (b.lng - a.lng) * cos,
      y = b.lat - a.lat,
      px = (p.lng - a.lng) * cos,
      py = p.lat - a.lat;
    const t = Math.max(
      0,
      Math.min(1, (px * x + py * y) / (x * x + y * y || 1)),
    );
    const q = {
      lat: a.lat + t * (b.lat - a.lat),
      lng: a.lng + t * (b.lng - a.lng),
    };
    const d = distance(p, q),
      length = distance(a, b);
    if (d < best.distance) best = { distance: d, along: offset + t * length };
    offset += length;
  }
  return best;
}
export function matchRoute(
  route: Point[],
  pickup: Point,
  destination: Point,
  departure: Date,
  wanted: Date,
  flexibility: number,
) {
  const p = project(pickup, route),
    d = project(destination, route),
    minutes = (departure.getTime() - wanted.getTime()) / 60000;
  if (
    p.distance > 2000 ||
    d.distance > 2000 ||
    p.along + 100 >= d.along ||
    Math.abs(minutes) > flexibility
  )
    return null;
  return {
    pickupMetres: Math.round(p.distance),
    dropoffMetres: Math.round(d.distance),
    minutes: Math.round(minutes),
    score: Math.round(
      100 *
        (0.6 * (1 - (p.distance + d.distance) / 4000) +
          0.3 * (1 - Math.abs(minutes) / Math.max(flexibility, 1))),
    ),
  };
}
export const karachiTime = (d: Date | string) =>
  new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(d));
export function journeyDates(
  time: string,
  weekdays: number[],
  days = 21,
  now = new Date(),
) {
  const local = new Date(now.getTime() + 5 * 3600000);
  const dates: Date[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + i,
      ),
    );
    if (weekdays.includes(day.getUTCDay())) {
      const [h, m] = time.split(":").map(Number);
      const departure = new Date(day.getTime() + (h - 5) * 3600000 + m * 60000);
      if (departure > now) dates.push(departure);
    }
  }
  return dates;
}
export function shareValid(
  share: { revoked: boolean; expiresAt: Date; ride: { status: string } },
  now = new Date(),
) {
  return (
    !share.revoked &&
    share.expiresAt > now &&
    !["COMPLETED", "CANCELLED"].includes(share.ride.status)
  );
}
