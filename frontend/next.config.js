/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https?.*$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offlineCache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
      },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Experimental features
  experimental: {
    appDir: true,
    serverComponentsExternalPackages: ['@properpos/shared'],
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '1.0.0',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },

  // Images configuration
  images: {
    domains: [
      'localhost',
      'images.unsplash.com',
      'avatars.githubusercontent.com',
      // Add your image domains here
      'properpos-uploads.s3.amazonaws.com',
      'properpos-assets.s3.amazonaws.com',
    ],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Headers for security
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=(), payment=(self)',
          },
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
                {
                  key: 'Content-Security-Policy',
                  value: [
                    "default-src 'self'",
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                    "font-src 'self' https://fonts.gstatic.com",
                    "img-src 'self' data: blob: https://properpos-uploads.s3.amazonaws.com https://properpos-assets.s3.amazonaws.com https://images.unsplash.com",
                    "connect-src 'self' https://*.properpos.com https://va.vercel-scripts.com",
                    "frame-ancestors 'none'",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "upgrade-insecure-requests",
                  ].join('; '),
                },
              ]
            : []),
        ],
      },
    ];
  },

  // Redirects (removed invalid redirects - dashboard/pos are handled by (dashboard) route group)
  async redirects() {
    return [];
  },

  // Rewrites for API proxy in development
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:3001/api/:path*', // Backend server
        },
      ];
    }
    return [];
  },

  // Webpack configuration
  webpack(config, { buildId, dev, isServer, defaultLoaders, webpack }) {
    // Optimize bundle size
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
          enforce: true,
        },
        common: {
          minChunks: 2,
          priority: 5,
          reuseExistingChunk: true,
        },
      },
    };

    // Add support for importing SVGs as React components
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: ['@svgr/webpack'],
    });

    // Ignore source maps in production
    if (!dev && !isServer) {
      config.devtool = false;
    }

    return config;
  },

  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: false,
  },

  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Output configuration for static export (if needed)
  output: process.env.NEXT_OUTPUT === 'export' ? 'export' : undefined,
  trailingSlash: process.env.NEXT_OUTPUT === 'export',

  // Compression
  compress: true,

  // Power by header
  poweredByHeader: false,

  // Generate ETags
  generateEtags: true,

  // HTTP keep alive
  httpAgentOptions: {
    keepAlive: true,
  },
};

module.exports = withBundleAnalyzer(withPWA(nextConfig));