/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const configured = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000';
    const backend = configured.startsWith('http') ? configured : `http://${configured}`;
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
