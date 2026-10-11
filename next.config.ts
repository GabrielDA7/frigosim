import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // drei <Html> crée des racines React : le double-montage de StrictMode (dev) déclenche de faux avertissements
  reactStrictMode: false,
  cacheComponents: true,
  partialPrefetching: true,
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
