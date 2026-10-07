import type { NextConfig } from "next";
import { accessOrigins } from "./src/lib/access";
const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: accessOrigins().map((origin) => new URL(origin).hostname),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=()",
          },
        ],
      },
    ];
  },
};
export default config;
