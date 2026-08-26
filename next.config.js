/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

const nextConfig = {
  // tienda-core se instala como fuente TS/TSX sin build propio — Next.js necesita
  // transpilarlo como si fuera parte del proyecto (mismo requisito que los templates).
  transpilePackages: ['@creart/tienda-core'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  // /suscripcion -> /dashboard/suscripcion (2026-08-26, pedido de ARam: la
  // URL final tiene que ser panel.gounuri.com/suscripcion, pero la página en
  // sí vive bajo /dashboard para heredar el layout con la barra lateral
  // -- ver src/app/dashboard/suscripcion/page.tsx).
  async redirects() {
    return [{ source: '/suscripcion', destination: '/dashboard/suscripcion', permanent: false }]
  },
  // @react-pdf/renderer uses Node.js-only modules — must run server-side only
  serverExternalPackages: ['@react-pdf/renderer'],
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig
