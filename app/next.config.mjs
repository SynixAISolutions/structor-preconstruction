/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local demos use next start; standalone packaging remains available for deployment.
  output: process.env.STRUCTOR_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
