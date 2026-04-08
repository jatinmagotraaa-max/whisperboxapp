import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Silence the monorepo workspace root warning on Vercel
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
  
  // Ensure ESLint errors don't fail Vercel builds
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Ensure TypeScript errors don't block deployment
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
