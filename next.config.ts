import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/weaving/tools/*': ['./lib/liaojieTools/originals/*.html', './lib/liaojieTools/frame-bridge.js', './lib/liaojieTools/field-theme.css'],
    '/liaojie/tools/*': ['./lib/liaojieTools/originals/*.html', './lib/liaojieTools/frame-bridge.js', './lib/liaojieTools/field-theme.css'],
  },
};

export default nextConfig;
