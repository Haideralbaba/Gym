import { openVoxaDatabase } from './db';
import { createVoxaApp } from './app';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const db = openVoxaDatabase();
const app = createVoxaApp(db);

app.listen(PORT, HOST, () => {
  console.log(`VOXA server listening on http://${HOST}:${PORT}`);
});
