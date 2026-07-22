/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/quotes/[id]/pdf": ["./lib/pdf/fonts/**/*"],
      "/api/invoices/[id]/pdf": ["./lib/pdf/fonts/**/*"],
    },
  },
};

export default nextConfig;
