import withPWA from "next-pwa";

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isStaticExport ? "export" : "standalone",
  trailingSlash: isStaticExport,
  reactStrictMode: true,
  images: {
    unoptimized: isStaticExport,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default withPWA({
  dest: "public",
  register: !isStaticExport,
  skipWaiting: !isStaticExport,
  disable: isStaticExport || process.env.NODE_ENV === "development",
})(nextConfig);
