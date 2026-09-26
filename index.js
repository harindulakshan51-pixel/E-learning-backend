import { databaseOptions } from './lib/databaseConfig.js';
import mongoose from 'mongoose';
import app from './app.js';
import { assertDatabaseReady } from './lib/databaseReady.js';
if (!process.env.JWT_SECRET_KEY || process.env.JWT_SECRET_KEY.length < 32) throw new Error('JWT_SECRET_KEY must contain at least 32 characters');
await mongoose.connect(process.env.MONGODB_URI, databaseOptions(process.env.MONGODB_URI));
await assertDatabaseReady(mongoose.connection.db);
app.listen(process.env.PORT || 3000, () => console.log(`Scholarly API ready on port ${process.env.PORT || 3000}; database: ${mongoose.connection.name} (Cluster01)`));
