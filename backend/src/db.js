import mongoose from 'mongoose';
import { config } from './config.js';

/**
 * Connect to MongoDB. Mongoose buffers queries until the connection is ready,
 * so callers don't need to await this before registering models.
 */
export async function connectDb(logger) {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('connected', () => logger?.info('MongoDB connected'));
  mongoose.connection.on('error', (err) =>
    logger?.error({ err }, 'MongoDB error'),
  );
  mongoose.connection.on('disconnected', () =>
    logger?.warn('MongoDB disconnected'),
  );

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 50, // scale: plenty of concurrent device writes
  });
  return mongoose.connection;
}
