import assert from "node:assert/strict";
import { db } from "../src/lib/db";
const base = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const run = Date.now().toString();
let checks = 0;
const users: string[] = [];
const log = (s: string) => {
  checks++;
  console.log(`PASS ${s}`);
};
class Client {
  cookie = "";
  userId = "";
  async call(path: string, body?: any) {
    const res = await fetch(`${base}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie: this.cookie,
        origin: base,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookies = res.headers.getSetCookie();
    if (cookies.length)
      this.cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  async ok(path: string, body?: any) {
    const r = await this.call(path, body);
    assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.data)}`);
    return r.data;
  }
}
async function create(n: string, gender: string, role = "PASSENGER") {
  const c = new Client();
  const email = `test-${n}-${run}@sathride.test`;
  const d = await c.ok("auth/sign-up/email", {
    name: `Test ${n}`,
    email,
    password: "TestPassword!2026",
  });
  c.userId = d.user.id;
  users.push(c.userId);
  await c.ok("profile", {
    name: `Test ${n}`,
    role,
    phone: `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
    city: "Rawalpindi",
    gender,
    bio: "Integration test fixture",
    preference: "MIXED",
  });
  return c;
}
try {
  const anon = new Client();
  assert.equal((await anon.call("me")).status, 401);
  log("anonymous requests denied");
  const driver = await create("driver", "MALE", "DRIVER"),
    a = await create("a", "MALE"),
    b = await create("b", "MALE"),
    female = new Client(),
    hidden = await create("hidden", "UNDISCLOSED"),
    outsider = new Client();
  await female.ok("auth/sign-in/email",{email:"sara@demo.sathride.test",password:"SathRideDemo!2026"});await outsider.ok("auth/sign-in/email",{email:"zain@demo.sathride.test",password:"SathRideDemo!2026"});
  const login = new Client();
  await login.ok("auth/sign-in/email", {
    email: `test-a-${run}@sathride.test`,
    password: "TestPassword!2026",
  });
  assert.equal((await login.ok("me")).id, a.userId);
  assert.equal((await a.call("admin")).status, 403);
  log("registration, password login and admin authorization");
  const v = await driver.ok("vehicles", {
    make: "Toyota",
    model: "Test",
    colour: "White",
    registration: `TEST-${run}`,
    seats: 3,
  });
  const points = [
    { lat: 33.6, lng: 73.05 },
    { lat: 33.65, lng: 73.05 },
    { lat: 33.7, lng: 73.05 },
  ];
  const departure = new Date(Date.now() + 86400000).toISOString();
  const rideInput = {
    vehicleId: v.id,
    pickup: "Test south pickup",
    destination: "Test north destination",
    points,
    departure,
    capacity: 1,
    price: 200,
    preference: "MIXED",
  };
  const ride = await driver.ok("rides", rideInput);
  assert.equal((await a.call(`rides/${ride.id}/start`, {})).status, 403);
  log("driver creates persisted ride; outsider cannot operate it");
  const found = await a.ok("search", {
    pickup: points[0],
    destination: points[2],
    departure,
    flexibility: 60,
    seats: 1,
    preference: "MIXED",
  });
  assert(found.some((r: any) => r.id === ride.id));
  log("passenger finds ride using real geometry and time");
  const ba = await a.ok(`rides/${ride.id}/request`, { seats: 1 }),
    bb = await b.ok(`rides/${ride.id}/request`, { seats: 1 });
  assert.equal((await a.ok(`rides/${ride.id}`)).available, 1);
  assert.equal(
    (await a.call(`rides/${ride.id}/request`, { seats: 1 })).status,
    400,
  );
  assert.equal(
    (await driver.call(`rides/${ride.id}/request`, { seats: 1 })).status,
    400,
  );
  log(
    "pending requests do not reserve seats; own and duplicate bookings rejected",
  );
  const outcomes = await Promise.all([
    driver.call(`bookings/${ba.id}/accept`, {}),
    driver.call(`bookings/${bb.id}/accept`, {}),
  ]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await a.ok(`rides/${ride.id}`)).available, 0);
  log("concurrent acceptance cannot overbook");
  const winner = outcomes[0].status === 200 ? a : b,
    won = outcomes[0].status === 200 ? ba : bb,
    loser = winner === a ? bb : ba;
  await winner.ok(`bookings/${won.id}/cancel`, {});
  assert.equal((await driver.ok(`rides/${ride.id}`)).available, 1);
  await driver.ok(`bookings/${loser.id}/accept`, {});
  log("cancellation releases capacity and request can then be accepted");
  const restricted = await driver.ok("rides", {
    ...rideInput,
    preference: "MALE_ONLY",
    capacity: 2,
  });
  assert.equal(
    (await female.call(`rides/${restricted.id}/request`, { seats: 1 })).status,
    403,
  );
  assert.equal(
    (await hidden.call(`rides/${restricted.id}/request`, { seats: 1 })).status,
    403,
  );
  assert.equal((await female.call(`rides/${restricted.id}`)).status, 403);
  assert.equal(
    (await driver.call("rides", { ...rideInput, preference: "FEMALE_ONLY" }))
      .status,
    400,
  );
  log(
    "restricted eligibility enforced for drivers, details, passengers and undisclosed gender",
  );
  const wrong = await a.ok("search", {
    pickup: points[2],
    destination: points[0],
    departure,
    flexibility: 60,
    seats: 1,
    preference: "MIXED",
  });
  assert(!wrong.some((r: any) => r.id === restricted.id));
  const late = await a.ok("search", {
    pickup: points[0],
    destination: points[2],
    departure: new Date(
      new Date(departure).getTime() + 3 * 3600000,
    ).toISOString(),
    flexibility: 30,
    seats: 1,
    preference: "MIXED",
  });
  assert(!late.some((r: any) => r.id === restricted.id));
  log("matching excludes reverse direction and incompatible time");
  const form = new FormData();
  form.set("kind", "IDENTITY");
  form.set(
    "file",
    new Blob(["%PDF-1.4\nFICTIONAL INTEGRATION TEST\n%%EOF"], {
      type: "application/pdf",
    }),
    "fictional.pdf",
  );
  const upload = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: { cookie: a.cookie, origin: base },
    body: form,
  });
  assert.equal(upload.status, 200);
  const doc = await upload.json();
  assert.equal(
    (
      await fetch(`${base}/api/files/${doc.id}`, {
        headers: { cookie: outsider.cookie },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/files/${doc.id}`, {
        headers: { cookie: a.cookie },
      })
    ).status,
    200,
  );
  log("private document upload and outsider access denial");
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { bookingId: ba.id },
  });
  await a.ok(`messages/${conversation.id}`, { text: "Private test message" });
  assert.equal(
    (await outsider.call(`messages/${conversation.id}`)).status,
    403,
  );
  assert.equal(
    (await outsider.call(`messages/${conversation.id}`, { text: "Forbidden" }))
      .status,
    403,
  );
  log("message authorization and persistence");
  const share = await driver.ok(`trip-share/${ride.id}`, {});
  assert.equal((await anon.call(`share/${share.token}`)).status, 200);
  await driver.ok(`trip-share/${share.id}/revoke`, {});
  assert.equal((await anon.call(`share/${share.token}`)).status, 404);
  const expired = await driver.ok(`trip-share/${ride.id}`, {});
  await db.shareToken.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await anon.call(`share/${expired.token}`)).status, 404);
  log("share links expire and revoke");
  assert.equal(
    (
      await a.call("reviews", {
        rideId: ride.id,
        subjectId: driver.userId,
        rating: 5,
        text: "Too early",
      })
    ).status,
    400,
  );
  assert.equal((await driver.call(`rides/${ride.id}/start`, {})).status, 400);
  await db.ride.update({
    where: { id: ride.id },
    data: { departure: new Date(Date.now() + 60000) },
  });
  await driver.ok(`rides/${ride.id}/start`, {});
  const confirmed = winner === a ? b : a;
  await confirmed.ok(`location/${ride.id}`, { lat: 33.63, lng: 73.05 });
  assert.equal(
    (await outsider.call(`location/${ride.id}`, { lat: 33.6, lng: 73.05 }))
      .status,
    403,
  );
  await driver.ok(`rides/${ride.id}/complete`, {});
  assert.equal(
    await db.locationUpdate.count({ where: { rideId: ride.id } }),
    0,
  );
  await confirmed.ok("reviews", {
    rideId: ride.id,
    subjectId: driver.userId,
    rating: 5,
    text: "Actual completed participant review",
  });
  assert.equal(
    (
      await confirmed.call("reviews", {
        rideId: ride.id,
        subjectId: driver.userId,
        rating: 4,
        text: "Duplicate review",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await outsider.call("reviews", {
        rideId: ride.id,
        subjectId: driver.userId,
        rating: 4,
        text: "Outsider review",
      })
    ).status,
    403,
  );
  log(
    "start/complete, location authorization/deletion, completed participant review restrictions",
  );
  const group = await driver.ok("groups", {
    vehicleId: v.id,
    pickup: "Test group south",
    destination: "Test group north",
    points,
    capacity: 1,
    price: 150,
    preference: "MIXED",
    name: "Test weekday group",
    time: "08:00",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  const count = await db.ride.count({ where: { seriesId: group.id } });
  await driver.ok(`groups/${group.id}/generate`, {});
  assert.equal(await db.ride.count({ where: { seriesId: group.id } }), count);
  await a.ok(`groups/${group.id}/join`, {});
  await driver.ok(`groups/${group.id}/approve`, { userId: a.userId });
  const occurrence = await db.ride.findFirstOrThrow({
    where: { seriesId: group.id },
    orderBy: { departure: "asc" },
  });
  assert.equal(
    (
      await db.booking.findUniqueOrThrow({
        where: {
          rideId_passengerId: { rideId: occurrence.id, passengerId: a.userId },
        },
      })
    ).status,
    "ACCEPTED",
  );
  await a.ok(`rides/${occurrence.id}/skip`, {});
  await driver.ok(`groups/${group.id}/generate`, {});
  assert.equal(
    (
      await db.booking.findUniqueOrThrow({
        where: {
          rideId_passengerId: { rideId: occurrence.id, passengerId: a.userId },
        },
      })
    ).status,
    "CANCELLED",
  );
  await driver.ok(`rides/${occurrence.id}/cancel`, {});
  assert.equal(
    (await db.rideSeries.findUniqueOrThrow({ where: { id: group.id } })).active,
    true,
  );
  log(
    "idempotent recurring generation, automatic dated seats, skip persistence and single-occurrence cancellation",
  );
  const community = await driver.ok("communities", {
    name: "Test community",
    type: "UNIVERSITY",
    city: "Islamabad",
    description: "Fictional integration test community",
  });
  await a.ok(`communities/${community.id}/join`, {});
  await driver.ok(`communities/${community.id}/approve`, { userId: a.userId });
  assert.equal(
    await db.verificationSubmission.count({
      where: { userId: a.userId, kind: "UNIVERSITY" },
    }),
    0,
  );
  log("community membership does not grant institutional verification");
  const blockRide=await driver.ok('rides',rideInput);const mixedBooking=await hidden.ok(`rides/${blockRide.id}/request`,{seats:1});await hidden.ok(`bookings/${mixedBooking.id}/cancel`,{});await driver.ok(`blocks/${hidden.userId}`, {});
  assert.equal(
    (await hidden.call(`rides/${blockRide.id}/request`, { seats: 1 })).status,
    403,
  );
  assert.equal(
    (await hidden.call(`messages/${conversation.id}`, { text: "Unwanted" }))
      .status,
    403,
  );
  log("blocked users cannot initiate new interactions");
  console.log(`${checks} database-backed integration workflows passed.`);
} finally {
  const ownedRides = await db.ride.findMany({
    where: { driverId: { in: users } },
    select: { id: true },
  });
  const ids = ownedRides.map((r) => r.id);
  const docs = await db.verificationSubmission.findMany({
    where: { userId: { in: users } },
    select: { filename: true },
  });
  await db.review.deleteMany({ where: { rideId: { in: ids } } });
  await db.report.deleteMany({
    where: {
      OR: [
        { reporterId: { in: users } },
        { subjectId: { in: users } },
        { rideId: { in: ids } },
      ],
    },
  });
  await db.shareToken.deleteMany({ where: { rideId: { in: ids } } });
  await db.booking.deleteMany({ where: { rideId: { in: ids } } });
  await db.ride.deleteMany({ where: { id: { in: ids } } });
  await db.rideSeries.deleteMany({ where: { driverId: { in: users } } });
  await db.community.deleteMany({ where: { ownerId: { in: users } } });
  await db.vehicle.deleteMany({ where: { driverId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  const { unlink } = await import("node:fs/promises");
  for (const d of docs)
    if (d.filename)
      await unlink(`storage/private/${d.filename}`).catch(() => {});
  await db.$disconnect();
}
