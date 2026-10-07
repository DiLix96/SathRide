import { db } from "../src/lib/db";
import { hashPassword } from "better-auth/crypto";
import { places } from "../src/lib/strings";
import { setupDemoAdmin } from "../src/lib/demo-admin";
import { generateSeries } from "../src/lib/service";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
if (process.env.NODE_ENV === "production")
  throw new Error("Demonstration seed is disabled in production.");
const password = await hashPassword("SathRideDemo!2026");
const tomorrow = new Date(Date.now() + 86400000 + 5 * 3600000)
  .toISOString()
  .slice(0, 10);
const tomorrowAt = (time: string) => new Date(`${tomorrow}T${time}:00+05:00`);
const route = [places[0], places[2], places[4]].map(({ lat, lng }) => ({
  lat,
  lng,
}));
try {
  const users = [
    ["hamza", "Hamza Farooq", "DRIVER", "MALE"],
    ["amna", "Amna Zafar", "BOTH", "FEMALE"],
    ["bilal", "Bilal Naveed", "PASSENGER", "MALE"],
    ["sara", "Sara Danish", "PASSENGER", "FEMALE"],
    ["zain", "Zain Saeed", "BOTH", "MALE"],
    ["admin", "Demo Administrator", "ADMIN", "UNDISCLOSED"],
  ] as const;
  for (const [i, [id, name, role, gender]] of users.entries()) {
    await db.user.upsert({
      where: { id: `demo-${id}` },
      create: {
        id: `demo-${id}`,
        name,
        role,
        email: `${id}@demo.sathride.test`,
        emailVerified: false,
        profile: {
          create: {
            phone: `+92300000010${i}`,
            city: "Islamabad",
            gender,
            institution:
              id === "zain"
                ? "Twin Cities Studio (fictional)"
                : "Margalla Learning Institute (fictional)",
            bio: "Fictional demonstration commuter. No affiliation or endorsement by any real institution.",
            preference: "MIXED",
            onboarded: true,
            emergencyName: "Fictional Contact",
            emergencyPhone: `+92300000020${i}`,
          },
        },
      },
      update: {},
    });
    await db.account.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: `demo-${id}`,
        },
      },
      create: {
        id: `demo-account-${id}`,
        providerId: "credential",
        accountId: `demo-${id}`,
        userId: `demo-${id}`,
        password,
      },
      update: {},
    });
  }
  await setupDemoAdmin();
  const vehicles = [
    ["hamza", "Toyota", "Corolla", "White", 4],
    ["amna", "Suzuki", "Alto", "Silver", 3],
    ["zain", "Honda", "City", "Navy", 4],
  ] as const;
  for (const [id, make, model, colour, seats] of vehicles)
    await db.vehicle.upsert({
      where: { id: `demo-vehicle-${id}` },
      create: {
        id: `demo-vehicle-${id}`,
        driverId: `demo-${id}`,
        make,
        model,
        colour,
        seats,
        registration: `FICTIONAL-${id.toUpperCase()}`,
      },
      update: {},
    });
  await mkdir(join(process.cwd(), "storage/private"), { recursive: true });
  await writeFile(
    join(process.cwd(), "storage/private", "demo-fictional-document"),
    "%PDF-1.4\n% FICTIONAL DEMO DOCUMENT - NOT AN IDENTITY DOCUMENT\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    { mode: 0o600 },
  );
  for (const id of ["hamza", "amna", "zain"])
    for (const kind of [
      "PHONE",
      "IDENTITY",
      "LICENCE",
      "VEHICLE",
      "UNIVERSITY",
    ] as const)
      await db.verificationSubmission.upsert({
        where: { userId_kind: { userId: `demo-${id}`, kind } },
        create: {
          userId: `demo-${id}`,
          kind,
          status: "APPROVED",
          note: "Fictional seeded development review; no actual identity or phone check.",
          ...(kind !== "PHONE"
            ? { filename: "demo-fictional-document", mime: "application/pdf" }
            : {}),
        },
        update: {},
      });
  await db.verificationSubmission.upsert({
    where: { userId_kind: { userId: "demo-sara", kind: "IDENTITY" } },
    create: {
      userId: "demo-sara",
      kind: "IDENTITY",
      status: "PENDING",
      filename: "demo-fictional-document",
      mime: "application/pdf",
      note: "Fictional submission for demonstrating the admin review queue.",
    },
    update: {},
  });
  for (const [id, name, type, city, owner] of [
    [
      "margalla",
      "Margalla Learning Circle (Demo)",
      "UNIVERSITY",
      "Islamabad",
      "hamza",
    ],
    ["studio", "Twin Cities Studio (Demo)", "WORKPLACE", "Islamabad", "zain"],
    [
      "saddar",
      "Saddar Neighbours (Demo)",
      "NEIGHBOURHOOD",
      "Rawalpindi",
      "amna",
    ],
    [
      "lahore",
      "Lahore Design Collective (Demo)",
      "WORKPLACE",
      "Lahore",
      "zain",
    ],
  ]) {
    await db.community.upsert({
      where: { id: `demo-community-${id}` },
      create: {
        id: `demo-community-${id}`,
        name,
        type,
        city,
        ownerId: `demo-${owner}`,
        description:
          "A fictional demonstration community. No real institution affiliation or endorsement.",
      },
      update: {},
    });
    for (const user of [
      owner,
      ...(id === "margalla" ? ["bilal", "sara", "amna"] : []),
    ])
      await db.communityMembership.upsert({
        where: {
          communityId_userId: {
            communityId: `demo-community-${id}`,
            userId: `demo-${user}`,
          },
        },
        create: {
          communityId: `demo-community-${id}`,
          userId: `demo-${user}`,
          status: "APPROVED",
        },
        update: {},
      });
  }
  const rides = [
    {
      id: "demo-mixed",
      driverId: "demo-hamza",
      vehicleId: "demo-vehicle-hamza",
      pickup: places[0].name,
      destination: places[4].name,
      route,
      departure: tomorrowAt("08:00"),
      capacity: 4,
      price: 220,
      preference: "MIXED" as const,
      notes: "Meet near the main road. Fictional demo journey.",
    },
    {
      id: "demo-female",
      driverId: "demo-amna",
      vehicleId: "demo-vehicle-amna",
      pickup: places[1].name,
      destination: places[6].name,
      route: [places[1], places[5], places[6]].map(({ lat, lng }) => ({
        lat,
        lng,
      })),
      departure: tomorrowAt("08:20"),
      capacity: 3,
      price: 180,
      preference: "FEMALE_ONLY" as const,
    },
    {
      id: "demo-male",
      driverId: "demo-zain",
      vehicleId: "demo-vehicle-zain",
      pickup: places[0].name,
      destination: places[4].name,
      route,
      departure: tomorrowAt("09:00"),
      capacity: 2,
      price: 250,
      preference: "MALE_ONLY" as const,
    },
    {
      id: "demo-lahore",
      driverId: "demo-hamza",
      vehicleId: "demo-vehicle-hamza",
      pickup: places[7].name,
      destination: places[8].name,
      route: places.slice(7, 9).map(({ lat, lng }) => ({ lat, lng })),
      departure: tomorrowAt("09:15"),
      capacity: 3,
      price: 200,
      preference: "MIXED" as const,
    },
    {
      id: "demo-karachi",
      driverId: "demo-zain",
      vehicleId: "demo-vehicle-zain",
      pickup: places[9].name,
      destination: places[10].name,
      route: places.slice(9, 11).map(({ lat, lng }) => ({ lat, lng })),
      departure: tomorrowAt("08:45"),
      capacity: 4,
      price: 300,
      preference: "MIXED" as const,
    },
    {
      id: "demo-active-ready",
      driverId: "demo-amna",
      vehicleId: "demo-vehicle-amna",
      pickup: places[0].name,
      destination: places[4].name,
      route,
      departure: new Date(Date.now() + 15 * 60000),
      capacity: 3,
      price: 200,
      preference: "MIXED" as const,
    },
    {
      id: "demo-completed",
      driverId: "demo-hamza",
      vehicleId: "demo-vehicle-hamza",
      pickup: places[0].name,
      destination: places[4].name,
      route,
      departure: new Date(Date.now() - 86400000),
      capacity: 4,
      price: 220,
      preference: "MIXED" as const,
      status: "COMPLETED" as const,
    },
  ];
  for (const ride of rides)
    await db.ride.upsert({
      where: { id: ride.id },
      create: { ...ride, conversation: { create: {} } },
      update: {},
    });
  for (const [rideId, passengerId, status] of [
    ["demo-mixed", "demo-sara", "PENDING"],
    ["demo-male", "demo-bilal", "ACCEPTED"],
    ["demo-active-ready", "demo-sara", "ACCEPTED"],
    ["demo-completed", "demo-bilal", "COMPLETED"],
  ] as const)
    await db.booking.upsert({
      where: { rideId_passengerId: { rideId, passengerId } },
      create: {
        rideId,
        passengerId,
        status,
        seats: 1,
        contribution: rideId === "demo-male" ? 250 : 220,
        conversation: { create: {} },
      },
      update: {},
    });
  for (const [authorId, subjectId, rating, text] of [
    [
      "demo-bilal",
      "demo-hamza",
      5,
      "Demo review from an actual linked completed journey. Great company.",
    ],
    [
      "demo-hamza",
      "demo-bilal",
      4,
      "Demo participant was punctual and communicative.",
    ],
  ] as const)
    await db.review.upsert({
      where: {
        rideId_authorId_subjectId: {
          rideId: "demo-completed",
          authorId,
          subjectId,
        },
      },
      create: { rideId: "demo-completed", authorId, subjectId, rating, text },
      update: {},
    });
  await db.rideSeries.upsert({
    where: { id: "demo-weekday-group" },
    create: {
      id: "demo-weekday-group",
      name: "Saddar → Margalla weekday circle",
      driverId: "demo-hamza",
      vehicleId: "demo-vehicle-hamza",
      communityId: "demo-community-margalla",
      pickup: places[0].name,
      destination: places[4].name,
      route,
      time: "08:00",
      weekdays: [1, 2, 3, 4, 5],
      capacity: 3,
      price: 180,
      preference: "MIXED",
      conversation: { create: {} },
    },
    update: {},
  });
  await db.groupMembership.upsert({
    where: {
      seriesId_userId: { seriesId: "demo-weekday-group", userId: "demo-bilal" },
    },
    create: {
      seriesId: "demo-weekday-group",
      userId: "demo-bilal",
      status: "APPROVED",
    },
    update: {},
  });
  await db.groupMembership.upsert({
    where: {
      seriesId_userId: { seriesId: "demo-weekday-group", userId: "demo-sara" },
    },
    create: {
      seriesId: "demo-weekday-group",
      userId: "demo-sara",
      status: "PENDING",
    },
    update: {},
  });
  await generateSeries("demo-weekday-group");
  const c = await db.conversation.findUniqueOrThrow({
    where: { seriesId: "demo-weekday-group" },
  });
  if (!(await db.message.count({ where: { conversationId: c.id } })))
    await db.message.create({
      data: {
        conversationId: c.id,
        senderId: "demo-hamza",
        text: "Welcome to the fictional weekday circle. Check the calendar and skip dates when needed.",
      },
    });
  console.log(
    "Fictional demo seeded. Accounts: hamza, amna, bilal, sara, zain, admin @demo.sathride.test. Password: see README. Never use demo credentials in production.",
  );
} finally {
  await db.$disconnect();
}
