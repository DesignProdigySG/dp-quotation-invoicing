/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/quotes/[id]/pdf": ["./lib/pdf/fonts/**/*", "./lib/pdf/assets/**/*"],
      "/api/invoices/[id]/pdf": ["./lib/pdf/fonts/**/*", "./lib/pdf/assets/**/*"],
    },
  },
};

export default nextConfig;
