import { openVoxaDatabase } from '../server/db';
import { createVoxaApp } from '../server/app';

const db = openVoxaDatabase();
const app = createVoxaApp(db);

export default function handler(req: any, res: any) {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}
