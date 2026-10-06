import { db } from "./db";
import { Prisma } from "../generated/prisma/client";
import {
  AppError,
  eligible,
  matchRoute,
  journeyDates,
  rideSchema,
  searchSchema,
  profileSchema,
  vehicleSchema,
  shareValid,
} from "./rules";
import type { Point } from "./rules";
import { routeFor } from "./providers";
import { z } from "zod";
export type Actor = {
  id: string;
  role: string;
  profile: { gender: string } | null;
  suspended: boolean;
};
type TX = Prisma.TransactionClient;
function requireOk(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new AppError(message, status);
}
export const publicUser = {
  id: true,
  name: true,
  image: true,
  profile: { select: { city: true, institution: true, bio: true } },
  verifications: { select: { kind: true, status: true } },
  reviewsReceived: { select: { rating: true } },
} satisfies Prisma.UserSelect;
export const rideInclude = {
  driver: { select: publicUser },
  vehicle: {
    select: { id: true, make: true, model: true, colour: true, seats: true },
  },
  community: true,
  bookings: {
    where: { status: { in: ["ACCEPTED", "COMPLETED"] } },
    select: { seats: true },
  },
} satisfies Prisma.RideInclude;
export async function actor(id: string) {
  const u = await db.user.findUnique({
    where: { id },
    include: { profile: true },
  });
  requireOk(u && !u.suspended && !(process.env.NODE_ENV === "production" && u.email.endsWith("@demo.sathride.test")), "Account unavailable.", 403);
  return u;
}
export async function notify(
  tx: TX,
  userId: string,
  title: string,
  body: string,
  href: string,
) {
  await tx.notification.create({ data: { userId, title, body, href } });
}
export async function blocked(tx: TX, a: string, b: string) {
  return !!(await tx.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  }));
}
async function ensureCommunity(
  tx: TX,
  userId: string,
  communityId: string | null | undefined,
) {
  if (communityId)
    requireOk(
      await tx.communityMembership.findFirst({
        where: { communityId, userId, status: "APPROVED" },
      }),
      "Approved community membership required.",
      403,
    );
}
export async function lockRide(tx: TX, id: string) {
  await tx.$queryRaw`SELECT id FROM "Ride" WHERE id = ${id} FOR UPDATE`;
  const ride = await tx.ride.findUnique({
    where: { id },
    include: {
      driver: { include: { profile: true } },
      vehicle: true,
      bookings: true,
    },
  });
  requireOk(ride, "Ride not found.", 404);
  return ride;
}
const driverRole = (u: Actor) =>
  requireOk(
    ["DRIVER", "BOTH"].includes(u.role),
    "A driver role is required.",
    403,
  );
async function canJoin(
  tx: TX,
  u: Actor,
  ride: Awaited<ReturnType<typeof lockRide>>,
) {
  requireOk(ride.driverId !== u.id, "You cannot book your own ride.");
  requireOk(
    ["PASSENGER", "BOTH"].includes(u.role),
    "Switch to a passenger role in your profile.",
    403,
  );
  requireOk(!ride.driver.suspended, "Driver account unavailable.", 403);
  requireOk(
    ride.status === "SCHEDULED" && ride.departure > new Date(),
    "This ride is no longer accepting requests.",
  );
  requireOk(
    eligible(ride.preference, u.profile?.gender ?? "UNDISCLOSED") &&
      eligible(ride.preference, ride.driver.profile?.gender ?? "UNDISCLOSED"),
    "You do not meet this ride’s gender preference.",
    403,
  );
  requireOk(
    !(await blocked(tx, u.id, ride.driverId)),
    "Interaction unavailable because of a block.",
    403,
  );
  for (const b of ride.bookings.filter((b) => b.status === "ACCEPTED"))
    requireOk(
      !(await blocked(tx, u.id, b.passengerId)),
      "Interaction unavailable because of a block.",
      403,
    );
  await ensureCommunity(tx, u.id, ride.communityId);
}
export async function updateProfile(u: Actor, input: unknown) {
  const p = profileSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${u.id} FOR UPDATE`;
    const rides = await tx.ride.findMany({
      where: {
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        OR: [
          { driverId: u.id },
          { bookings: { some: { passengerId: u.id, status: "ACCEPTED" } } },
        ],
      },
    });
    requireOk(
      rides.every((r) => eligible(r.preference, p.gender)),
      "Finish or cancel restricted rides before changing eligibility.",
    );
    requireOk(
      (!rides.some((r) => r.driverId === u.id) &&
        !(await tx.rideSeries.count({
          where: { driverId: u.id, active: true },
        }))) ||
        ["DRIVER", "BOTH"].includes(p.role),
      "Keep a driver role while you have scheduled rides or groups.",
    );
    const memberships = await tx.groupMembership.findMany({
      where: { userId: u.id, status: "APPROVED" },
      include: { series: true },
    });
    requireOk(
      memberships.every((m) => eligible(m.series.preference, p.gender)),
      "Leave restricted groups before changing eligibility.",
    );
    requireOk(
      (
        await tx.rideSeries.findMany({
          where: { driverId: u.id, active: true },
        })
      ).every((s) => eligible(s.preference, p.gender)),
      "Disable restricted groups before changing eligibility.",
    );
    const old = await tx.profile.findUnique({ where: { userId: u.id } });
    if (old?.phone !== p.phone)
      await tx.verificationSubmission.deleteMany({
        where: { userId: u.id, kind: "PHONE" },
      });
    const { name, role, image, ...profile } = p;
    await tx.user.update({
      where: { id: u.id },
      data: {
        name,
        ...(u.role !== "ADMIN" ? { role } : {}),
        image: image || null,
      },
    });
    return tx.profile.upsert({
      where: { userId: u.id },
      create: { userId: u.id, ...profile, onboarded: true },
      update: { ...profile, onboarded: true },
    });
  });
}
export async function addVehicle(u: Actor, input: unknown) {
  driverRole(u);
  return db.vehicle.create({
    data: { driverId: u.id, ...vehicleSchema.parse(input) },
  });
}
export async function createRide(u: Actor, input: unknown) {
  driverRole(u);
  const p = rideSchema.parse(input);
  requireOk(
    new Date(p.departure) > new Date(),
    "Departure must be in the future.",
  );
  requireOk(
    eligible(p.preference, u.profile?.gender ?? "UNDISCLOSED"),
    "Your gender must meet the ride preference.",
  );
  requireOk(
    p.points.some(
      (pt) =>
        Math.abs(pt.lat - p.points[0].lat) +
          Math.abs(pt.lng - p.points[0].lng) >
        0.001,
    ),
    "Choose distinct pickup and destination coordinates.",
  );
  const v = await db.vehicle.findFirst({
    where: { id: p.vehicleId, driverId: u.id },
  });
  requireOk(
    v && p.capacity <= v.seats,
    "Capacity exceeds your vehicle’s passenger seats.",
  );
  const route = await routeFor(p.points);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${u.id} FOR UPDATE`;
    const fresh = await tx.user.findUniqueOrThrow({
      where: { id: u.id },
      include: { profile: true },
    });
    driverRole(fresh);
    requireOk(
      eligible(p.preference, fresh.profile?.gender ?? "UNDISCLOSED"),
      "Driver eligibility changed.",
    );
    await ensureCommunity(tx, u.id, p.communityId);
    const { points, departure, ...data } = p;
    return tx.ride.create({
      data: {
        ...data,
        driverId: u.id,
        departure: new Date(departure),
        route: route.route,
        routeApproximate: route.approximate,
        waypoints: {
          create: points
            .slice(1, -1)
            .map((pt, position) => ({
              ...pt,
              position,
              label: `Pickup waypoint ${position + 1}`,
            })),
        },
        conversation: { create: {} },
      },
    });
  });
}
export async function requestBooking(u: Actor, rideId: string, seats: number) {
  z.number().int().min(1).max(12).parse(seats);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${u.id} FOR UPDATE`;
    const fresh = await tx.user.findUniqueOrThrow({
      where: { id: u.id },
      include: { profile: true },
    });
    const ride = await lockRide(tx, rideId);
    await canJoin(tx, fresh, ride);
    requireOk(
      seats <=
        ride.capacity -
          ride.bookings
            .filter((b) => b.status === "ACCEPTED")
            .reduce((n, b) => n + b.seats, 0),
      "Not enough available seats.",
    );
    const old = ride.bookings.find((b) => b.passengerId === u.id);
    requireOk(
      !old || !["PENDING", "ACCEPTED", "COMPLETED"].includes(old.status),
      "You already have an active request.",
    );
    const booking = await tx.booking.upsert({
      where: { rideId_passengerId: { rideId, passengerId: u.id } },
      create: {
        rideId,
        passengerId: u.id,
        seats,
        contribution: ride.price * seats,
        conversation: { create: {} },
      },
      update: {
        status: "PENDING",
        seats,
        contribution: ride.price * seats,
        settled: false,
      },
    });
    await tx.bookingEvent.create({data:{bookingId:booking.id,status:"PENDING"}});
    await notify(
      tx,
      ride.driverId,
      "New seat request",
      `${fresh.name} requested ${seats} seat(s).`,
      `/rides/${rideId}`,
    );
    return booking;
  });
}
export async function bookingAction(u: Actor, id: string, action: string) {
  requireOk(
    ["accept", "reject", "cancel", "settle"].includes(action),
    "Invalid booking action.",
  );
  const initial = await db.booking.findUnique({ where: { id } });
  requireOk(initial, "Booking not found.", 404);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${initial.passengerId} FOR UPDATE`;
    const ride = await lockRide(tx, initial.rideId);
    const b = ride.bookings.find((b) => b.id === id)!;
    const isDriver = u.id === ride.driverId,
      isPassenger = u.id === b.passengerId;
    requireOk(isDriver || isPassenger, "Not your booking.", 403);
    if (action === "settle") {
      requireOk(
        ["ACCEPTED", "COMPLETED"].includes(b.status),
        "Settlement is only available for agreed bookings.",
      );
      return tx.booking.update({
        where: { id },
        data: { settled: !b.settled },
      });
    }
    if (action === "accept" || action === "reject") {
      requireOk(isDriver, "Only the driver can decide requests.", 403);
      requireOk(
        b.status === "PENDING",
        "This request has already been decided.",
      );
      requireOk(
        ride.status === "SCHEDULED" && ride.departure > new Date(),
        "Ride has departed or ended.",
      );
      if (action === "accept") {
        const p = await tx.user.findUniqueOrThrow({
          where: { id: b.passengerId },
          include: { profile: true },
        });
        requireOk(!p.suspended, "Passenger account unavailable.");
        await canJoin(tx, p, ride);
        requireOk(
          ride.bookings
            .filter((b) => b.status === "ACCEPTED")
            .reduce((n, b) => n + b.seats, 0) +
            b.seats <=
            ride.capacity,
          "Not enough seats to accept this request.",
          409,
        );
      }
    }
    if (action === "cancel")
      requireOk(
        ["PENDING", "ACCEPTED"].includes(b.status) &&
          ride.status === "SCHEDULED",
        "This booking cannot be cancelled now.",
      );
    const status =
      action === "accept"
        ? "ACCEPTED"
        : action === "reject"
          ? "REJECTED"
          : "CANCELLED";
    const out = await tx.booking.update({ where: { id }, data: { status } });
    await tx.bookingEvent.create({data:{bookingId:id,status}});
    await notify(
      tx,
      isDriver ? b.passengerId : ride.driverId,
      `Booking ${status.toLowerCase()}`,
      `${ride.pickup} → ${ride.destination}`,
      `/rides/${ride.id}`,
    );
    return out;
  });
}
export async function rideAction(
  u: Actor,
  id: string,
  action: string,
  input?: unknown,
) {
  return db.$transaction(async (tx) => {
    const ride = await lockRide(tx, id);
    requireOk(
      ride.driverId === u.id,
      "Only the driver can operate this ride.",
      403,
    );
    if (action === "edit") {
      requireOk(
        ride.status === "SCHEDULED" && ride.departure > new Date(),
        "This ride cannot be edited.",
      );
      const p = z
        .object({
          notes: z.string().max(1000),
          capacity: z.number().int().min(1).max(12),
        })
        .parse(input);
      requireOk(
        p.capacity <= ride.vehicle.seats &&
          p.capacity >=
            ride.bookings
              .filter((b) => b.status === "ACCEPTED")
              .reduce((n, b) => n + b.seats, 0),
        "Capacity would invalidate accepted seats.",
      );
      await tx.ride.update({ where: { id }, data: p });
      for (const b of ride.bookings.filter((b) =>
        ["PENDING", "ACCEPTED"].includes(b.status),
      ))
        await notify(
          tx,
          b.passengerId,
          "Ride updated",
          "Driver changed notes or available capacity. Check ride details.",
          `/rides/${id}`,
        );
      return { ok: true };
    }
    const next =
      action === "start"
        ? "IN_PROGRESS"
        : action === "complete"
          ? "COMPLETED"
          : action === "cancel"
            ? "CANCELLED"
            : null;
    requireOk(next, "Invalid ride action.");
    requireOk(
      action === "complete"
        ? ride.status === "IN_PROGRESS"
        : ride.status === "SCHEDULED",
      "Invalid ride transition.",
    );
    if (action === "start")
      requireOk(
        ride.departure.getTime() - Date.now() <= 30 * 60000,
        "Start is available 30 minutes before departure.",
      );
    await tx.ride.update({ where: { id }, data: { status: next } });
    if (action === "start")
      await tx.booking.updateMany({
        where: { rideId: id, status: "PENDING" },
        data: { status: "REJECTED" },
      });
    if (action === "cancel")
      await tx.booking.updateMany({
        where: { rideId: id, status: { in: ["PENDING", "ACCEPTED"] } },
        data: { status: "CANCELLED" },
      });
    if (action === "complete")
      await tx.booking.updateMany({
        where: { rideId: id, status: "ACCEPTED" },
        data: { status: "COMPLETED" },
      });
    if (next === "COMPLETED" || next === "CANCELLED") {
      await tx.locationUpdate.deleteMany({ where: { rideId: id } });
      await tx.shareToken.updateMany({
        where: { rideId: id },
        data: { revoked: true },
      });
    }
    for (const b of ride.bookings.filter(b=>["PENDING","ACCEPTED"].includes(b.status))) { const status=next==="CANCELLED"?"CANCELLED":next==="COMPLETED"&&b.status==="ACCEPTED"?"COMPLETED":next==="IN_PROGRESS"&&b.status==="PENDING"?"REJECTED":null; if(status)await tx.bookingEvent.create({data:{bookingId:b.id,status}}); }
    for (const b of ride.bookings.filter((b) =>
      ["PENDING", "ACCEPTED"].includes(b.status),
    ))
      await notify(
        tx,
        b.passengerId,
        `Ride ${next.toLowerCase().replace("_", " ")}`,
        `${ride.pickup} → ${ride.destination}`,
        `/rides/${id}`,
      );
    return { ok: true };
  });
}
export async function searchRides(u: Actor, input: unknown) {
  const p = searchSchema.parse(input);
  if (p.preference !== "MIXED")
    requireOk(
      eligible(p.preference, u.profile?.gender ?? "UNDISCLOSED"),
      "Your gender information does not meet the search preference.",
      403,
    );
  const when = new Date(p.departure);
  const communities=await db.communityMembership.findMany({where:{userId:u.id,status:"APPROVED"},select:{communityId:true}});
  const rides = await db.ride.findMany({
    where: {
      status: "SCHEDULED",
      departure: {
        gte: new Date(
          Math.max(Date.now(), when.getTime() - p.flexibility * 60000),
        ),
        lte: new Date(when.getTime() + p.flexibility * 60000),
      },
      ...(p.maxPrice ? { price: { lte: p.maxPrice } } : {}),
      ...(p.communityId ? { communityId: p.communityId } : {}),
      ...(p.preference !== "MIXED" ? { preference: p.preference } : {}),
    },
    include: {
      ...rideInclude,
      driver: {
        select: {
          ...publicUser,
          memberships:{where:{status:"APPROVED"},select:{communityId:true,community:{select:{name:true}}}},
          profile: {
            select: { gender: true, city: true, institution: true, bio: true },
          },
        },
      },
    },
    take: 200,
  });
  const out = [];
  for (const r of rides) {
    if (
      r.driverId === u.id ||
      !eligible(r.preference, u.profile?.gender ?? "UNDISCLOSED") ||
      !eligible(r.preference, r.driver.profile?.gender ?? "UNDISCLOSED") ||
      (await blocked(db, u.id, r.driverId))
    )
      continue;
    if (
      p.verified &&
      !r.driver.verifications.some(
        (v) => v.kind === "IDENTITY" && v.status === "APPROVED",
      )
    )
      continue;
    if (
      r.communityId &&
      !(await db.communityMembership.findFirst({
        where: { userId: u.id, communityId: r.communityId, status: "APPROVED" },
      }))
    )
      continue;
    const seats = r.capacity - r.bookings.reduce((n, b) => n + b.seats, 0);
    if (seats < p.seats) continue;
    const match = matchRoute(
      r.route as Point[],
      p.pickup,
      p.destination,
      r.departure,
      when,
      p.flexibility,
    );
    if (match) {
      const { gender: privateGender, ...profile } = r.driver.profile ?? {};
      void privateGender;
      const common=r.driver.memberships.find(m=>communities.some(c=>c.communityId===m.communityId));
      match.score+=common?10:0;
      const {memberships:privateMemberships,...driver}=r.driver; void privateMemberships;
      out.push({
        ...r,
        driver: { ...driver, profile },
        available: seats,
        match:{...match,sharedCommunity:common?.community.name??null},
      });
    }
  }
  return out.sort((a, b) => b.match.score - a.match.score);
}
export async function rideDetail(u: Actor, id: string) {
  const r = await db.ride.findUnique({
    where: { id },
    include: {
      ...rideInclude,
      bookings: {
        include: { passenger: { select: publicUser }, conversation: true, events: {orderBy: {createdAt: "asc"}} },
      },
      conversation: true,
      waypoints: true,
      shares: { where: { ownerId: u.id } },
      reviews: true,
    },
  });
  requireOk(r, "Ride not found.", 404);
  const mine = r.bookings.find((b) => b.passengerId === u.id),
    participant = r.driverId === u.id || !!mine;
  if (!participant) {
    requireOk(
      eligible(r.preference, u.profile?.gender ?? "UNDISCLOSED"),
      "Ride preference does not match your profile.",
      403,
    );
    requireOk(
      !(await blocked(db, u.id, r.driverId)),
      "Interaction unavailable.",
      403,
    );
    await ensureCommunity(db, u.id, r.communityId);
  }
  return {
    ...r,
    available:
      r.capacity -
      r.bookings
        .filter((b) => ["ACCEPTED", "COMPLETED"].includes(b.status))
        .reduce((n, b) => n + b.seats, 0),
    bookings:
      r.driverId === u.id
        ? r.bookings
        : r.bookings
            .filter(
              (b) =>
                b.passengerId === u.id ||
                ["ACCEPTED", "COMPLETED"].includes(b.status),
            )
            .map((b) =>
              b.passengerId === u.id
                ? b
                : {
                    id: b.id,
                    status: b.status,
                    seats: b.seats,
                    passenger: b.passenger,
                  },
            ),
    myBooking: mine ?? null,
    locations:
      participant &&
      r.status === "IN_PROGRESS" &&
      (r.driverId === u.id || mine?.status === "ACCEPTED")
        ? (await db.locationUpdate.findMany({
            where: {
              rideId: id,
              updatedAt: { gte: new Date(Date.now() - 3600000) },
            },
            select: { userId: true, lat: true, lng: true, updatedAt: true },
          })).map(l=>({...l,stale:Date.now()-l.updatedAt.getTime()>60000}))
        : [],
  };
}
export async function addReview(u: Actor, input: unknown) {
  const p = z
    .object({
      rideId: z.string(),
      subjectId: z.string(),
      rating: z.number().int().min(1).max(5),
      text: z.string().trim().min(3).max(1000),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const r = await lockRide(tx, p.rideId);
    requireOk(
      r.status === "COMPLETED",
      "Reviews open after a completed journey.",
    );
    const participants = [
      r.driverId,
      ...r.bookings
        .filter((b) => b.status === "COMPLETED")
        .map((b) => b.passengerId),
    ];
    requireOk(
      p.subjectId !== u.id &&
        participants.includes(u.id) &&
        participants.includes(p.subjectId),
      "Only actual participants may review one another.",
      403,
    );
    requireOk(
      !(await blocked(tx, u.id, p.subjectId)),
      "Interaction unavailable.",
      403,
    );
    requireOk(
      !(await tx.review.findUnique({
        where: {
          rideId_authorId_subjectId: {
            rideId: p.rideId,
            authorId: u.id,
            subjectId: p.subjectId,
          },
        },
      })),
      "You already reviewed this participant.",
    );
    return tx.review.create({ data: { ...p, authorId: u.id } });
  });
}
export async function conversationUsers(tx: TX, id: string) {
  const c = await tx.conversation.findUnique({
    where: { id },
    include: {
      booking: { include: { ride: true } },
      ride: {
        include: {
          bookings: { where: { status: { in: ["ACCEPTED", "COMPLETED"] } } },
        },
      },
      series: { include: { members: { where: { status: "APPROVED" } } } },
    },
  });
  requireOk(c, "Conversation not found.", 404);
  if (c.booking) return [c.booking.passengerId, c.booking.ride.driverId];
  if (c.ride)
    return [c.ride.driverId, ...c.ride.bookings.map((b) => b.passengerId)];
  if (c.series)
    return [c.series.driverId, ...c.series.members.map((m) => m.userId)];
  return [];
}
export async function messages(u: Actor, id: string) {
  const users = await conversationUsers(db, id);
  requireOk(users.includes(u.id), "This conversation is private.", 403);
  const data = await db.message.findMany({
    where: { conversationId: id },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  await db.conversationRead.upsert({
    where: { conversationId_userId: { conversationId: id, userId: u.id } },
    create: { conversationId: id, userId: u.id },
    update: { readAt: new Date() },
  });
  return data.reverse();
}
export async function sendMessage(u: Actor, id: string, input: unknown) {
  const text = z.string().trim().min(1).max(2000).parse(input);
  return db.$transaction(async (tx) => {
    const users = await conversationUsers(tx, id);
    requireOk(users.includes(u.id), "This conversation is private.", 403);
    for (const other of users.filter((x) => x !== u.id))
      requireOk(
        !(await blocked(tx, u.id, other)),
        "Messaging unavailable because of a block.",
        403,
      );
    const message = await tx.message.create({
      data: { conversationId: id, senderId: u.id, text },
    });
    for (const other of users.filter((x) => x !== u.id))
      await notify(
        tx,
        other,
        "New message",
        "You have a new conversation message.",
        `/messages/${id}`,
      );
    return message;
  });
}
export async function createSeries(u: Actor, input: unknown) {
  driverRole(u);
  const p = rideSchema
    .omit({ departure: true, luggage: true, smoking: true, notes: true })
    .extend({
      name: z.string().trim().min(3).max(80),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    })
    .parse(input);
  requireOk(
    eligible(p.preference, u.profile?.gender ?? "UNDISCLOSED"),
    "Your profile does not meet the group preference.",
  );
  const v = await db.vehicle.findFirst({
    where: { id: p.vehicleId, driverId: u.id },
  });
  requireOk(v && p.capacity <= v.seats, "Invalid vehicle capacity.");
  await ensureCommunity(db, u.id, p.communityId);
  const { points, ...data } = p;
  const s = await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${u.id} FOR UPDATE`;const fresh=await tx.user.findUniqueOrThrow({where:{id:u.id},include:{profile:true}});driverRole(fresh);requireOk(!fresh.suspended&&eligible(p.preference,fresh.profile?.gender??"UNDISCLOSED"),"Driver eligibility changed.");return tx.rideSeries.create({data:{...data,driverId:u.id,route:points,conversation:{create:{}}}});});
  await generateSeries(s.id);
  return s;
}
export async function generateSeries(seriesId?: string, now = new Date()) {
  const all = await db.rideSeries.findMany({
    where: { active: true, ...(seriesId ? { id: seriesId } : {}) },
    include: {
      members: {
        where: { status: "APPROVED" },
        include: { user: { include: { profile: true } } },
      },
    },
  });
  let created = 0;
  for (const s of all) {
    const dates = journeyDates(s.time, s.weekdays, 21, now);
    const result = await db.ride.createMany({
      data: dates.map((departure) => ({
        seriesId: s.id,
        driverId: s.driverId,
        vehicleId: s.vehicleId,
        communityId: s.communityId,
        pickup: s.pickup,
        destination: s.destination,
        route: s.route as Prisma.InputJsonValue,
        departure,
        capacity: s.capacity,
        price: s.price,
        preference: s.preference,
      })),
      skipDuplicates: true,
    });
    created += result.count;
    const rides = await db.ride.findMany({
      where: { seriesId: s.id, departure: { gt: now }, status: "SCHEDULED" },
    });
    for (const r of rides)
      await db.$transaction(async (tx) => {
        const ride = await lockRide(tx, r.id);
        await tx.conversation.upsert({
          where: { rideId: r.id },
          create: { rideId: r.id },
          update: {},
        });
        for (const member of s.members) {
          const skip = await tx.journeySkip.findUnique({
            where: { rideId_userId: { rideId: r.id, userId: member.userId } },
          });
          if (
            skip ||
            ride.bookings.some((b) => b.passengerId === member.userId) ||
            ride.bookings
              .filter((b) => b.status === "ACCEPTED")
              .reduce((n, b) => n + b.seats, 0) >= ride.capacity
          )
            continue;
          try {
            await canJoin(tx, member.user, ride);
          } catch (e) {
            if (e instanceof AppError) continue;
            throw e;
          }
          const b = await tx.booking.create({
            data: {
              rideId: r.id,
              passengerId: member.userId,
              seats: 1,
              status: "ACCEPTED",
              contribution: s.price,
              events:{create:{status:"ACCEPTED"}},
              conversation: { create: {} },
            },
          });
          ride.bookings.push(b);
          await notify(
            tx,
            member.userId,
            "Carpool journey confirmed",
            `${s.name}: one seat reserved. Skip a date from the calendar.`,
            `/rides/${r.id}`,
          );
        }
      });
  }
  return { created };
}
export async function groupAction(
  u: Actor,
  id: string,
  action: string,
  userId?: string,
) {
  const s = await db.rideSeries.findUnique({
    where: { id },
    include: { driver: { include: { profile: true } } },
  });
  requireOk(s, "Group not found.", 404);
  if (action === "join") {
    requireOk(u.id !== s.driverId && s.active, "You cannot join this group.");
    requireOk(
      ["PASSENGER", "BOTH"].includes(u.role) &&
        eligible(s.preference, u.profile?.gender ?? "UNDISCLOSED") &&
        eligible(s.preference, s.driver.profile?.gender ?? "UNDISCLOSED"),
      "Your profile does not meet group eligibility.",
      403,
    );
    requireOk(
      !(await blocked(db, u.id, s.driverId)),
      "Interaction unavailable.",
      403,
    );
    await ensureCommunity(db, u.id, s.communityId);
    const old = await db.groupMembership.findUnique({
      where: { seriesId_userId: { seriesId: id, userId: u.id } },
    });
    requireOk(
      !old || !["PENDING", "APPROVED"].includes(old.status),
      "Membership already active.",
    );
    const m = await db.groupMembership.upsert({
      where: { seriesId_userId: { seriesId: id, userId: u.id } },
      create: { seriesId: id, userId: u.id },
      update: { status: "PENDING" },
    });
    await notify(
      db,
      s.driverId,
      "Group membership request",
      "A passenger requested to join your recurring carpool.",
      `/groups/${id}`,
    );
    return m;
  }
  if (action === "leave") {
    await db.groupMembership.updateMany({
      where: { seriesId: id, userId: u.id },
      data: { status: "REJECTED" },
    });
    const rides = await db.ride.findMany({
      where: {
        seriesId: id,
        status: "SCHEDULED",
        departure: { gt: new Date() },
      },
    });
    for (const r of rides) await skipJourney(u, r.id);
    return { ok: true };
  }
  requireOk(
    s.driverId === u.id,
    "Only the group driver can manage memberships.",
    403,
  );
  if (action === "disable") {
    await db.rideSeries.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }
  requireOk(
    userId && ["approve", "reject"].includes(action),
    "Invalid group action.",
  );
  const member = await actor(userId);
  requireOk(
    eligible(s.preference, member.profile?.gender ?? "UNDISCLOSED") &&
      !(await blocked(db, u.id, userId)),
    "Member is not eligible.",
  );
  await ensureCommunity(db, userId, s.communityId);
  const m=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;const fresh=await tx.user.findUniqueOrThrow({where:{id:userId},include:{profile:true}});requireOk(!fresh.suspended&&eligible(s.preference,fresh.profile?.gender??"UNDISCLOSED"),"Member eligibility changed.");return tx.groupMembership.update({where:{seriesId_userId:{seriesId:id,userId}},data:{status:action==="approve"?"APPROVED":"REJECTED"}});});
  await notify(
    db,
    userId,
    `Group membership ${m.status.toLowerCase()}`,
    s.name,
    `/groups/${id}`,
  );
  if (action === "approve") await generateSeries(id);
  return m;
}
export async function skipJourney(u: Actor, id: string) {
  return db.$transaction(async (tx) => {
    const r = await lockRide(tx, id);
    requireOk(
      r.seriesId && r.status === "SCHEDULED" && r.departure > new Date(),
      "Only future group journeys can be skipped.",
    );
    requireOk(
      await tx.groupMembership.findFirst({
        where: { seriesId: r.seriesId, userId: u.id },
      }),
      "You are not a group member.",
      403,
    );
    await tx.journeySkip.upsert({
      where: { rideId_userId: { rideId: id, userId: u.id } },
      create: { rideId: id, userId: u.id },
      update: {},
    });
    await tx.booking.updateMany({
      where: {
        rideId: id,
        passengerId: u.id,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
      data: { status: "CANCELLED" },
    });
    const b=await tx.booking.findUnique({where:{rideId_passengerId:{rideId:id,passengerId:u.id}}});if(b)await tx.bookingEvent.create({data:{bookingId:b.id,status:"CANCELLED"}});
    await notify(
      tx,
      r.driverId,
      "Member skipped a journey",
      "A group member released their seat for this date.",
      `/rides/${id}`,
    );
    return { ok: true };
  });
}
export async function tripParticipant(u: Actor, rideId: string) {
  const r = await db.ride.findUnique({
    where: { id: rideId },
    include: {
      bookings: {
        where: { passengerId: u.id, status: { in: ["ACCEPTED", "COMPLETED"] } },
      },
    },
  });
  requireOk(
    r && (r.driverId === u.id || r.bookings.length),
    "Only confirmed participants can access this trip.",
    403,
  );
  return r;
}
export async function createShare(u: Actor, rideId: string) {
  const r = await tripParticipant(u, rideId);
  requireOk(["SCHEDULED", "IN_PROGRESS"].includes(r.status), "Trip has ended.");
  return db.shareToken.create({
    data: {
      ownerId: u.id,
      rideId,
      token: crypto.randomUUID() + crypto.randomUUID(),
      expiresAt: new Date(
        Math.max(Date.now(), r.departure.getTime()) + 12 * 3600000,
      ),
    },
  });
}
export async function getShare(token: string) {
  const s = await db.shareToken.findUnique({
    where: { token },
    include: { ride: true },
  });
  requireOk(s && shareValid(s), "Share link expired or revoked.", 404);
  return {
    pickup: s.ride.pickup,
    destination: s.ride.destination,
    departure: s.ride.departure,
    status: s.ride.status,
    expiresAt: s.expiresAt,
  };
}
export async function location(u: Actor, id: string, input: unknown) {
  const r = await tripParticipant(u, id);
  requireOk(
    r.status === "IN_PROGRESS",
    "Location sharing is only available during an active journey.",
  );
  const p = z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .parse(input);
  await db.locationUpdate.deleteMany({
    where: { updatedAt: { lt: new Date(Date.now() - 3600000) } },
  });
  return db.locationUpdate.upsert({
    where: { rideId_userId: { rideId: id, userId: u.id } },
    create: { rideId: id, userId: u.id, ...p },
    update: p,
  });
}
