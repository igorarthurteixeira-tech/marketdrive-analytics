import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "njitzfpyhwcqoaluuvqo.supabase.co",
      },
    ],
  },
};

export default nextConfig;