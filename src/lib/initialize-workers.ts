import { initializeWorkers } from '../jobs';
import { logger } from './logger';

let initialized = false;

/**
 * Initialize workers once on first import
 * This runs when any API route is accessed
 */
export function ensureWorkersInitialized(): void {
  if (!initialized && process.env.NODE_ENV !== 'test') {
    try {
      // MVP: Skip worker initialization - use direct API calls instead
      // initializeWorkers();
      initialized = true;
      logger.info('MVP: Skipping background job workers - using direct API calls');
    } catch (error) {
      logger.error('Failed to initialize workers', { error });
      // Don't throw - allow the app to continue without workers
    }
  }
}

// Auto-initialize on import in production
if (process.env.NODE_ENV === 'production') {
  ensureWorkersInitialized();
}
