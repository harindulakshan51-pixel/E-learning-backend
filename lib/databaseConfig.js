import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve the project's file regardless of the shell's working directory.
// Local settings take precedence over stale values inherited by nodemon.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), override: true, quiet: true });

export function databaseOptions(uri) {
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error('MONGODB_URI is missing or invalid'); }
  if (parsed.protocol !== 'mongodb+srv:' || parsed.hostname !== 'cluster01.ppxvtza.mongodb.net' || parsed.pathname !== '/E-learning-web') {
    throw new Error('API startup refused: configure the new cluster01 MongoDB project and E-learning-web database in backend/.env.');
  }
  return { dbName: 'E-learning-web', autoIndex: false };
}
