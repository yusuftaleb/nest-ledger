import type { NextConfig } from "next";

// Every page shows one household's private data, so nothing is prerendered or cached on the server.
// In the browser, a page you just visited is reused for 30 seconds, so moving between tabs is instant;
// any save calls revalidatePath, which clears that cache, so edits always show at once.
const nextConfig: NextConfig = {
  experimental: { staleTimes: { dynamic: 30 } },
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
