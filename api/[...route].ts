import handleVercelApiRequest, { type VercelNodeRequest } from '../server/vercelHandler';
import type { ServerResponse } from 'http';

export default function handler(req: VercelNodeRequest, res: ServerResponse) {
  return handleVercelApiRequest(req, res);
}
