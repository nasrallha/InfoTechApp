import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  cacheComponents: true,

  experimental: {
    serverActions: {
      // الحد الافتراضي لحجم الطلب 1MB، ونحن نسمح بصور حتى 2MB
      bodySizeLimit: "3mb",
    },
  },
};
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
