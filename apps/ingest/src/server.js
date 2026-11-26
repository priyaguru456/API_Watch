import { createIngestApp } from './app.js';
import { prisma } from '@apiwatch/db';

const port = process.env.INGEST_PORT || 5001;
const app = createIngestApp({ db: prisma });

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.info(`APIWatch High-Throughput Ingest Service listening on port ${port}`);
  });
}

export default app;
