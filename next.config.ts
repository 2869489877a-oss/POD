import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Let Next's image optimizer resize/compress remote images (Supabase Storage)
    // so the gallery grid serves ~30KB thumbnails instead of full-res originals.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
