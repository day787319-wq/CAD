/** @type {import('next').NextConfig} */
const backendInternalUrl = (process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8006").replace(/\/$/, "")

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${backendInternalUrl}/:path*`,
      },
    ]
  },
}

export default nextConfig
