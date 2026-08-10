/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  reactCompiler: true,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  experimental: {
    // swcMinify removed - invalid option in Next.js 16
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Add for Google Auth avatars
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Security headers: Content-Security-Policy + browser hardening.
  // The CSP restricts what the page may load/connect to, which is the primary
  // mitigation for session-token theft via XSS (the auth cookie must remain
  // readable by JS for @supabase/ssr session hydration, so it can't be httpOnly).
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      // Next.js injects inline scripts for the App Router; 'unsafe-eval' is only
      // needed in development (webpack source maps / fast refresh).
      `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      // avatars + storage media (client-side compression previews use blob: URLs)
      "img-src 'self' data: blob: https://*.supabase.co https://i.pravatar.cc https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      // REST + Realtime (wss) + storage, all on the project's Supabase host
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "media-src 'self' https://*.supabase.co blob:",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
  turbopack: {}, // Empty config to silence Next.js 16 error
  webpack: (config: any) => {
    // Improve performance
    config.watchOptions = {
      poll: false,
      aggregateTimeout: 300,
      ignored: /node_modules/,
    };
    
    // Optimize for development
    if (config.mode === 'development') {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              enforce: true,
            },
          },
        },
        moduleIds: 'deterministic',
      };
      
      // Faster source maps in development
      config.devtool = 'eval-cheap-module-source-map';
    }
    
    return config;
  },
};
export default nextConfig;
