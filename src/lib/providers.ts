import { db } from "./db";
export const simulation = () =>
  process.env.NODE_ENV !== "production" &&
  process.env.DEV_SIMULATION === "true";
export const deliveryAvailable = () =>
  simulation() ||
  !!(process.env.DELIVERY_WEBHOOK_URL && process.env.DELIVERY_WEBHOOK_SECRET);
export async function deliver(kind: string, to: string, text: string) {
  if (simulation()) {
    await db.devDelivery.create({ data: { kind, to, text } });
    return "Local simulation: delivery stored in development inbox. No message sent.";
  }
  if (!deliveryAvailable())
    throw new Error(
      "Delivery unavailable: a production provider has not been configured.",
    );
  const url = new URL(process.env.DELIVERY_WEBHOOK_URL!);
  if (url.protocol !== "https:")
    throw new Error("Production delivery requires HTTPS.");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DELIVERY_WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({ kind, to, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok)
    throw new Error("Delivery provider unavailable. Please try later.");
  return "Submitted to configured delivery provider.";
}
export type Point = { lat: number; lng: number };
export async function routeFor(
  points: Point[],
): Promise<{ route: Point[]; approximate: boolean }> {
  if (process.env.ROUTING_URL) {
    try {
      const response = await fetch(
        `${process.env.ROUTING_URL!.replace(/\/$/, "")}/route/v1/driving/${points.map((p) => `${p.lng},${p.lat}`).join(";")}?overview=full&geometries=geojson`,
        { signal: AbortSignal.timeout(5000) },
      );
      const data = await response.json();
      if (data.code === "Ok" && data.routes[0].geometry.coordinates.length)
        return {
          route: data.routes[0].geometry.coordinates.map(
            ([lng, lat]: number[]) => ({ lat, lng }),
          ),
          approximate: false,
        };
    } catch {
      /* Deterministic fallback is labelled, never log coordinates. */
    }
  }
  return { route: points, approximate: true };
}
