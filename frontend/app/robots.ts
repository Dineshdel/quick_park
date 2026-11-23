import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.WEB_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/parking-owner', '/vehicle-owner', '/api/', '/account'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
