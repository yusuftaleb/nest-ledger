import type { NextConfig } from "next";

// Every page shows one household's private data, so nothing is prerendered or cached on the server.
// In the browser, a page you just visited is reused for 30 seconds, so moving between tabs is instant;
// any save calls revalidatePath, which clears that cache, so edits always show at once.
const nextConfig: NextConfig = {
  experimental: { staleTimes: { dynamic: 30 } },
  // The content security policy is set per page in src/proxy.ts (it needs a fresh nonce); these are the same everywhere.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
