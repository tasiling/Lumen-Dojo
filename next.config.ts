import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/liaojie/tools/*': ['./lib/liaojieTools/originals/*.html', './lib/liaojieTools/frame-bridge.js'],
  },
};

export default nextConfig;
