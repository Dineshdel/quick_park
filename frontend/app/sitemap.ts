import type { Paginated, SearchResultDto } from '@qp/types';
import type { MetadataRoute } from 'next';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.WEB_ORIGIN?.split(',')[0]?.trim() ||
  'http://localhost:3000';

export const revalidate = 3600;

/** Home, search and every live parking place, so search engines can find them. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'daily', priority: 0.8 },
  ];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${API}/api/v1/parkings/search?pageSize=50&page=${page}`, {
      next: { revalidate: 3600 },
    }).catch(() => null);
    if (!res?.ok) break;
    const data = (await res.json()) as Paginated<SearchResultDto>;
    for (const p of data.items)
      pages.push({ url: `${SITE_URL}/p/${p.slug}`, changeFrequency: 'weekly', priority: 0.7 });
    if (page * data.pageSize >= data.total) break;
  }
  return pages;
}
