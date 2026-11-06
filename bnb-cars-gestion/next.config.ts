import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  // Photos d'états des lieux prises au téléphone : plusieurs Mo par envoi
  experimental: { serverActions: { bodySizeLimit: '40mb' } },
  serverExternalPackages: ['exceljs', 'pdf-lib'],
  turbopack: { root: path.join(__dirname) },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=()' },
    ] }];
  },
};
export default config;
