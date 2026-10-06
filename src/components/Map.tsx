"use client";
import { useEffect, useRef } from "react";
import type { Point } from "@/lib/rules";
import type { Map as LeafletMap } from "leaflet";
export default function Map({
  route = [],
  routes = [],
  onSelect,
  locations = [],
}: {
  route?: Point[];
  routes?: Point[][];
  onSelect?: (p: Point) => void;
  locations?: Point[];
}) {
  const root = useRef<HTMLDivElement>(null),
    mapRef = useRef<LeafletMap | null>(null),
    callback = useRef(onSelect);
  callback.current = onSelect;
  const key = JSON.stringify([route, routes, locations]);
  useEffect(() => {
    let active = true;
    let map: LeafletMap | undefined;
    (async () => {
      const L = await import("leaflet");
      if (!active || !root.current) return;
      map = L.map(root.current).setView([33.655, 73.05], 12);
      mapRef.current = map;
      L.tileLayer(
        process.env.NEXT_PUBLIC_TILE_URL ||
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ||
            "© OpenStreetMap contributors",
          maxZoom: 19,
        },
      ).addTo(map);
      const all: Point[] = [];
      for (const line of [route, ...routes].filter((r) => r.length)) {
        const coords = line.map((p) => [p.lat, p.lng] as [number, number]);
        L.polyline(coords, {
          color: "#0d9488",
          weight: 5,
          dashArray: "8,8",
        }).addTo(map);
        all.push(...line);
        line.forEach((p, i) =>
          L.circleMarker([p.lat, p.lng], {
            radius: i === 0 || i === line.length - 1 ? 8 : 5,
            color: "#102b46",
            fillColor: "#fff",
            fillOpacity: 1,
          }).addTo(map!),
        );
      }
      locations.forEach((p) => {
        L.circleMarker([p.lat, p.lng], { radius: 9, color: "#e97839" }).addTo(
          map!,
        );
        all.push(p);
      });
      if (all.length > 1)
        map.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng])), {
          padding: [30, 30],
          maxZoom: 14,
        });
      map.on("click", (event) =>
        callback.current?.({
          lat: Number(event.latlng.lat.toFixed(6)),
          lng: Number(event.latlng.lng.toFixed(6)),
        }),
      );
    })();
    return () => {
      active = false;
      map?.remove();
      mapRef.current = null;
    };
    // Coordinates intentionally determine map reinitialization; callbacks use refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div>
      <div
        className="map"
        ref={root}
        role="img"
        aria-label="Route map. Dashed lines show route geometry; approximate routes are straight segments."
      />
      <p className="caption">
        Map © OpenStreetMap contributors. Dashed geometry is approximate unless
        a road routing provider is configured.
        {onSelect
          ? " Click the map to set the selected location; coordinate fields also work with a keyboard."
          : ""}
      </p>
    </div>
  );
}
