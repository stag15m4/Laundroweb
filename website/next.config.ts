import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole site builds to plain HTML/CSS in `out/`.
  // Host it free on Cloudflare Pages, Netlify, Vercel, or any static host.
  output: "export",
  // This project sits inside the Laundroweb repo for now; pin the tracing root
  // so Next does not walk up and pick the ops app's lockfile.
  outputFileTracingRoot: __dirname,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
