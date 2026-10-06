import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as svc from "@/lib/service";
import { AppError, eligible } from "@/lib/rules";
import { checkOrigin, jsonBody, rateLimit } from "@/lib/security";
import { simulation, deliver, deliveryAvailable } from "@/lib/providers";
import { z, ZodError } from "zod";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomInt, createHash, timingSafeEqual } from "node:crypto";
export const runtime = "nodejs";
function requireOk(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new AppError(message, status);
}
const privateDir = join(process.cwd(), "storage", "private");
async function handle(req: NextRequest, params: Promise<{ path: string[] }>) {
  try {
    const { path } = await params;
    const [resource, id, action] = path;
    const isGet = req.method === "GET";
    if (!isGet) checkOrigin(req);
    if (resource === "capabilities")
      return NextResponse.json({
        simulation: simulation(),
        delivery: deliveryAvailable(),
        emergencyNumber: process.env.EMERGENCY_NUMBER || null,
      });
    if (resource === "share" && id && isGet)
      return NextResponse.json(await svc.getShare(id));
    const session = await auth.api.getSession({ headers: req.headers });
    requireOk(session, "Please sign in.", 401);
    const u = await svc.actor(session.user.id);
    if (!isGet)
      await rateLimit(`${u.id}:${resource}`, resource === "messages" ? 40 : 30);
    let body: any = {};
    if (!isGet && resource !== "upload") body = await jsonBody(req);
    let data: unknown;
    switch (resource) {
      case "me":
        data = {
          ...u,
          vehicles: await db.vehicle.findMany({ where: { driverId: u.id } }),
          verifications: await db.verificationSubmission.findMany({
            where: { userId: u.id },
            select: {
              id: true,
              kind: true,
              status: true,
              note: true,
              rejectionReason: true,
              createdAt: true,
            },
          }),
          blocks: await db.block.findMany({
            where: { blockerId: u.id },
            include: { blocked: { select: { id: true, name: true } } },
          }),
        };
        break;
      case "profile":
        requireOk(!isGet, "Method not allowed.", 405);
        data = await svc.updateProfile(u, body);
        break;
      case "vehicles":
        requireOk(!isGet, "Method not allowed.", 405);
        data = await svc.addVehicle(u, body);
        break;
      case "search":
        requireOk(!isGet, "Use the search form.", 405);
        data = await svc.searchRides(u, body);
        break;
      case "rides":
        if (isGet && id) data = await svc.rideDetail(u, id);
        else if (isGet) {
          const mine = req.nextUrl.searchParams.get("mine") === "true";
          if (mine)
            data = await db.ride.findMany({
              where: {
                OR: [
                  { driverId: u.id },
                  { bookings: { some: { passengerId: u.id } } },
                ],
              },
              include: {
                ...svc.rideInclude,
                bookings: { where: { passengerId: u.id } },
              },
              orderBy: { departure: "asc" },
              take: 100,
            });
          else {
            const all = await db.ride.findMany({
              where: {
                status: "SCHEDULED",
                departure: { gt: new Date() },
                communityId: null,
                driver: { suspended: false },
              },
              include: svc.rideInclude,
              orderBy: { departure: "asc" },
              take: 30,
            });
            data = [];
            for (const r of all)
              if (
                eligible(r.preference, u.profile?.gender ?? "UNDISCLOSED") &&
                !(await svc.blocked(db, u.id, r.driverId))
              )
                (data as any[]).push({
                  ...r,
                  available:
                    r.capacity - r.bookings.reduce((n, b) => n + b.seats, 0),
                });
          }
        } else if (id && action === "request")
          data = await svc.requestBooking(u, id, body.seats);
        else if (id && action === "skip") data = await svc.skipJourney(u, id);
        else if (id && action) data = await svc.rideAction(u, id, action, body);
        else data = await svc.createRide(u, body);
        break;
      case "bookings":
        requireOk(!isGet && id && action, "Invalid booking operation.");
        data = await svc.bookingAction(u, id, action);
        break;
      case "reviews":
        if (isGet)
          data = await db.review.findMany({
            where: { subjectId: u.id },
            include: { author: { select: { id: true, name: true } } },
          });
        else data = await svc.addReview(u, body);
        break;
      case "communities":
        if (isGet)
          data = await db.community.findMany({
            include: {
              owner: { select: { id: true, name: true } },
              memberships: {
                where: {
                  OR: [{ userId: u.id }, { community: { ownerId: u.id } }],
                },
                include: { user: { select: { id: true, name: true } } },
              },
              _count: {
                select: { memberships: { where: { status: "APPROVED" } } },
              },
            },
            orderBy: { createdAt: "desc" },
          });
        else if (!id) {
          const p = z
            .object({
              name: z.string().trim().min(3).max(100),
              type: z.enum(["UNIVERSITY", "WORKPLACE", "NEIGHBOURHOOD"]),
              city: z.string().min(2).max(80),
              description: z.string().min(5).max(500),
            })
            .parse(body);
          data = await db.community.create({
            data: {
              ...p,
              ownerId: u.id,
              memberships: { create: { userId: u.id, status: "APPROVED" } },
            },
          });
        } else if (action === "join") {
          const c = await db.community.findUnique({ where: { id } });
          requireOk(c, "Community not found.", 404);
          requireOk(
            !(await svc.blocked(db, u.id, c.ownerId)),
            "Interaction unavailable.",
            403,
          );
          const old = await db.communityMembership.findUnique({
            where: { communityId_userId: { communityId: id, userId: u.id } },
          });
          requireOk(
            !old || old.status === "REJECTED",
            "Membership is already active.",
          );
          data = await db.communityMembership.upsert({
            where: { communityId_userId: { communityId: id, userId: u.id } },
            create: { communityId: id, userId: u.id },
            update: { status: "PENDING" },
          });
          await svc.notify(
            db,
            c.ownerId,
            "Community membership request",
            "A commuter requested membership. Membership does not verify institution affiliation.",
            "/communities",
          );
        } else if (action === "approve" || action === "reject") {
          const c = await db.community.findUnique({ where: { id } });
          requireOk(
            c?.ownerId === u.id,
            "Only the community owner can decide requests.",
            403,
          );
          const userId = z.string().parse(body.userId);
          requireOk(
            !(await svc.blocked(db, u.id, userId)),
            "Interaction unavailable.",
            403,
          );
          data = await db.communityMembership.update({
            where: { communityId_userId: { communityId: id, userId } },
            data: { status: action === "approve" ? "APPROVED" : "REJECTED" },
          });
          await svc.notify(
            db,
            userId,
            `Community membership ${action}d`,
            c.name,
            "/communities",
          );
        } else throw new AppError("Invalid community action.");
        break;
      case "groups":
        if (isGet) {
          const all = await db.rideSeries.findMany({
            where: id ? { id } : { active: true },
            include: {
              driver: { select: svc.publicUser },
              vehicle: {
                select: { make: true, model: true, colour: true, seats: true },
              },
              community: true,
              members: {
                include: { user: { select: { id: true, name: true } } },
              },
              rides: {
                where: {
                  departure: { gt: new Date(Date.now() - 24 * 3600000) },
                },
                orderBy: { departure: "asc" },
                include: {
                  bookings: { where: { passengerId: u.id } },
                  skips: { where: { userId: u.id } },
                },
              },
              conversation: true,
            },
          });
          data = [];
          for (const s of all) {
            if (
              s.driverId !== u.id &&
              (!eligible(s.preference, u.profile?.gender ?? "UNDISCLOSED") ||
                (await svc.blocked(db, u.id, s.driverId)))
            )
              continue;
            if (
              s.communityId &&
              !(await db.communityMembership.findFirst({
                where: {
                  communityId: s.communityId,
                  userId: u.id,
                  status: "APPROVED",
                },
              }))
            )
              continue;
            (data as any[]).push({
              ...s,
              members:
                s.driverId === u.id
                  ? s.members
                  : s.members.filter(
                      (m) => m.userId === u.id || m.status === "APPROVED",
                    ),
            });
          }
          if (id) data = (data as any[])[0] ?? null;
        } else if (!id) data = await svc.createSeries(u, body);
        else if (action === "generate") {
          const s = await db.rideSeries.findUnique({ where: { id } });
          requireOk(
            s?.driverId === u.id,
            "Only the driver can generate journeys.",
            403,
          );
          data = await svc.generateSeries(id);
        } else data = await svc.groupAction(u, id, action!, body.userId);
        break;
      case "messages":
        if (id) {
          data = isGet
            ? await svc.messages(u, id)
            : await svc.sendMessage(u, id, body.text);
        } else {
          const all = await db.conversation.findMany({
            where: {
              OR: [
                {
                  booking: {
                    OR: [{ passengerId: u.id }, { ride: { driverId: u.id } }],
                  },
                },
                {
                  ride: {
                    OR: [
                      { driverId: u.id },
                      {
                        bookings: {
                          some: {
                            passengerId: u.id,
                            status: { in: ["ACCEPTED", "COMPLETED"] },
                          },
                        },
                      },
                    ],
                  },
                },
                {
                  series: {
                    OR: [
                      { driverId: u.id },
                      {
                        members: { some: { userId: u.id, status: "APPROVED" } },
                      },
                    ],
                  },
                },
              ],
            },
            include: {
              booking: {
                include: {
                  ride: { select: { pickup: true, destination: true } },
                },
              },
              ride: { select: { pickup: true, destination: true } },
              series: { select: { name: true } },
              messages: { orderBy: { createdAt: "desc" }, take: 1 },
              reads: { where: { userId: u.id } },
            },
          });
          data = all.map((c) => ({
            ...c,
            unread: c.messages.some(
              (m) =>
                m.senderId !== u.id &&
                (!c.reads[0] || m.createdAt > c.reads[0].readAt),
            ),
          }));
        }
        break;
      case "notifications":
        if (isGet)
          data = await db.notification.findMany({
            where: { userId: u.id },
            orderBy: { createdAt: "desc" },
            take: 100,
          });
        else {
          data = await db.notification.updateMany({
            where: { userId: u.id, ...(id ? { id } : {}) },
            data: { read: true },
          });
        }
        break;
      case "upload": {
        requireOk(!isGet, "Method not allowed.", 405);
        requireOk(
          Number(req.headers.get("content-length") || 0) <= 6 * 1024 * 1024,
          "File too large. Maximum 5 MB.",
          413,
        );
        const form = await req.formData();
        const kind = z
          .enum(["IDENTITY", "UNIVERSITY", "WORKPLACE", "LICENCE", "VEHICLE"])
          .parse(form.get("kind"));
        const file = form.get("file");
        requireOk(
          file instanceof File && file.size > 0 && file.size <= 5 * 1024 * 1024,
          "Choose a PDF, PNG, or JPEG under 5 MB.",
        );
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdf = buffer.subarray(0, 5).toString() === "%PDF-",
          png = buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
          jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
        const mime = pdf
          ? "application/pdf"
          : png
            ? "image/png"
            : jpg
              ? "image/jpeg"
              : null;
        requireOk(
          mime && mime === file.type,
          "File type and content must be a PDF, PNG, or JPEG.",
        );
        const filename = crypto.randomUUID();
        await mkdir(privateDir, { recursive: true });
        await writeFile(join(privateDir, filename), buffer, { mode: 0o600 });
        const old = await db.verificationSubmission.findUnique({
          where: { userId_kind: { userId: u.id, kind } },
        });
        data = await db.verificationSubmission.upsert({
          where: { userId_kind: { userId: u.id, kind } },
          create: {
            userId: u.id,
            kind,
            filename,
            mime,
            note: String(form.get("note") || "").slice(0, 500),
          },
          update: {
            filename,
            mime,
            status: "PENDING",
            rejectionReason: null,
            reviewedAt: null,
            note: String(form.get("note") || "").slice(0, 500),
          },
        });
        if (old?.filename)
          await unlink(join(privateDir, old.filename)).catch(() => {});
        break;
      }
      case "files": {
        const v = await db.verificationSubmission.findUnique({ where: { id } });
        requireOk(
          v && v.filename && (v.userId === u.id || u.role === "ADMIN"),
          "Private file access denied.",
          403,
        );
        return new NextResponse(await readFile(join(privateDir, v.filename)), {
          headers: {
            "Content-Type": v.mime || "application/octet-stream",
            "Content-Disposition": `attachment; filename="verification.${v.mime === "application/pdf" ? "pdf" : v.mime === "image/png" ? "png" : "jpg"}"`,
            "Cache-Control": "private, no-store",
          },
        });
      }
      case "phone": {
        requireOk(
          !isGet && u.profile?.phone,
          "Complete your phone number in your profile.",
        );
        await rateLimit(`${u.id}:phone`, 5, 300);
        if (action === "send") {
          requireOk(
            deliveryAvailable(),
            "Phone verification unavailable: SMS provider is not configured.",
            503,
          );
          const code = String(randomInt(100000, 1000000));
          await db.verification.deleteMany({
            where: { identifier: `phone:${u.id}` },
          });
          await db.verification.create({
            data: {
              id: crypto.randomUUID(),
              identifier: `phone:${u.id}`,
              value: createHash("sha256")
                .update(`${u.profile.phone}:${code}`)
                .digest("hex"),
              expiresAt: new Date(Date.now() + 5 * 60000),
            },
          });
          data = {
            message: await deliver("phone-code", u.profile.phone, code),
          };
        } else {
          const code = z
            .string()
            .regex(/^\d{6}$/)
            .parse(body.code);
          const v = await db.verification.findFirst({
            where: {
              identifier: `phone:${u.id}`,
              expiresAt: { gt: new Date() },
            },
          });
          const hash = createHash("sha256")
            .update(`${u.profile.phone}:${code}`)
            .digest("hex");
          requireOk(
            v && timingSafeEqual(Buffer.from(v.value), Buffer.from(hash)),
            "Code invalid or expired.",
          );
          await db.verification.delete({ where: { id: v.id } });
          data = await db.verificationSubmission.upsert({
            where: { userId_kind: { userId: u.id, kind: "PHONE" } },
            create: {
              userId: u.id,
              kind: "PHONE",
              status: "APPROVED",
              note: simulation()
                ? "Development simulation; no SMS sent."
                : "Configured SMS challenge completed.",
            },
            update: {
              status: "APPROVED",
              note: simulation()
                ? "Development simulation; no SMS sent."
                : "Configured SMS challenge completed.",
            },
          });
        }
        break;
      }
      case "dev-inbox":
        requireOk(simulation(), "Development inbox unavailable.", 404);
        data = await db.devDelivery.findMany({
          where: {
            OR: [{ to: u.email }, { to: u.profile?.phone || "none" }],
            createdAt: { gt: new Date(Date.now() - 15 * 60000) },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });
        break;
      case "reports":
        requireOk(!isGet, "Method not allowed.", 405);
        {
          const p = z
            .object({
              subjectId: z.string().optional(),
              rideId: z.string().optional(),
              reason: z.string().trim().min(10).max(1000),
            })
            .refine((p) => p.subjectId || p.rideId, "Select a user or ride.")
            .parse(body);
          data = await db.report.create({ data: { ...p, reporterId: u.id } });
        }
        break;
      case "blocks":
        requireOk(!isGet && id && id !== u.id, "Select another user.");
        if (action === "remove")
          data = await db.block.deleteMany({
            where: { blockerId: u.id, blockedId: id },
          });
        else
          data = await db.block.upsert({
            where: { blockerId_blockedId: { blockerId: u.id, blockedId: id } },
            create: { blockerId: u.id, blockedId: id },
            update: {},
          });
        break;
      case "trip-share":
        requireOk(!isGet && id, "Select a trip.");
        if (action === "revoke")
          data = await db.shareToken.updateMany({
            where: { id, ownerId: u.id },
            data: { revoked: true },
          });
        else data = await svc.createShare(u, id);
        break;
      case "location":
        requireOk(!isGet && id, "Select a trip.");
        if (action === "stop")
          data = await db.locationUpdate.deleteMany({
            where: { rideId: id, userId: u.id },
          });
        else data = await svc.location(u, id, body);
        break;
      case "admin": {
        requireOk(u.role === "ADMIN", "Administrator access required.", 403);
        if (isGet)
          data = {
            users: await db.user.findMany({
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                suspended: true,
              },
            }),
            verifications: await db.verificationSubmission.findMany({
              include: { user: { select: { id: true, name: true } } },
              orderBy: { createdAt: "desc" },
            }),
            reports: await db.report.findMany({
              include: {
                reporter: { select: { name: true } },
                subject: { select: { name: true } },
              },
              orderBy: { createdAt: "desc" },
            }),
            audits: await db.adminAudit.findMany({
              orderBy: { createdAt: "desc" },
              take: 50,
            }),
            counts: {
              users: await db.user.count(),
              rides: await db.ride.count(),
              bookings: await db.booking.count(),
            },
          };
        else {
          const p = z
            .object({ reason: z.string().trim().min(3).max(500) })
            .parse(body);
          requireOk(id, "Select an admin target.");
          data = await db.$transaction(async (tx) => {
            if (action === "approve" || action === "reject") {
              const v = await tx.verificationSubmission.findUnique({
                where: { id },
              });
              requireOk(
                v && v.kind !== "PHONE",
                "Phone verification uses an OTP challenge.",
              );
              requireOk(v.status === "PENDING", "Submission already reviewed.");
              await tx.verificationSubmission.update({
                where: { id },
                data: {
                  status: action === "approve" ? "APPROVED" : "REJECTED",
                  rejectionReason: action === "reject" ? p.reason : null,
                  reviewedAt: new Date(),
                },
              });
              await svc.notify(
                tx,
                v.userId,
                `Verification ${action}d`,
                action === "reject"
                  ? p.reason
                  : `${v.kind.toLowerCase()} manually reviewed. This is not government verification.`,
                "/verification",
              );
            } else if (action === "resolve")
              await tx.report.update({
                where: { id },
                data: { resolved: true },
              });
            else if (action === "suspend" || action === "restore") {
              requireOk(id !== u.id, "You cannot suspend yourself.");
              await tx.user.update({
                where: { id },
                data: { suspended: action === "suspend" },
              });
              if (action === "suspend")
                await tx.session.deleteMany({ where: { userId: id } });
            } else throw new AppError("Invalid admin action.");
            await tx.adminAudit.create({
              data: {
                adminId: u.id,
                action: action!,
                target: id,
                reason: p.reason,
              },
            });
            return { ok: true };
          });
        }
        break;
      }
      default:
        throw new AppError("Endpoint not found.", 404);
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (e instanceof AppError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if ((e as { code?: string }).code === "P2002")
      return NextResponse.json(
        { error: "This record already exists." },
        { status: 409 },
      );
    return NextResponse.json(
      {
        error:
          "Unable to complete the request. Please retry or contact an administrator.",
      },
      { status: 500 },
    );
  }
}
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(req, ctx.params);
}
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(req, ctx.params);
}
