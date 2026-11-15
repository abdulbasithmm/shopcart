import type { IncomingMessage, ServerResponse } from 'http';
import { getApiApp } from './createApiApp';

export type VercelNodeRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  url?: string;
};

export default function handleVercelApiRequest(req: VercelNodeRequest, res: ServerResponse) {
  const rawUrl = req.url || '/api';

  // Normalize Vercel catch-all URLs so Express always receives the /api/... pathname
  if (!rawUrl.startsWith('/api')) {
    const queryIndex = rawUrl.indexOf('?');
    const search = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
    const routeParam = req.query?.route;
    if (Array.isArray(routeParam) && routeParam.length > 0) {
      req.url = `/api/${routeParam.join('/')}${search}`;
    } else if (typeof routeParam === 'string' && routeParam.trim()) {
      req.url = `/api/${routeParam.replace(/^\/+/, '')}${search}`;
    } else {
      req.url = `/api${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
    }
  } else if (rawUrl.startsWith('/api/[...route]')) {
    const queryIndex = rawUrl.indexOf('?');
    const params = new URLSearchParams(queryIndex >= 0 ? rawUrl.slice(queryIndex + 1) : '');
    const routeParts = params.getAll('route').filter(Boolean);
    params.delete('route');
    const cleanSearch = params.toString() ? `?${params.toString()}` : '';
    req.url = `/api${routeParts.length > 0 ? `/${routeParts.join('/')}` : ''}${cleanSearch}`;
  }

  const app = getApiApp();
  return app(req as any, res as any);
}
