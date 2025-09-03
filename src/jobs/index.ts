import { createWorker } from '../services/job-queue';
import { processSendRequestJob } from './send-request';
import { logger } from '../lib/logger';

/**
 * Initialize all job workers
 */
export function initializeWorkers(): void {
  logger.info('Initializing job workers...');

  // Create worker for send-request jobs
  createWorker('send-request', processSendRequestJob, {
    concurrency: 10,
    limiter: {
      max: 50,
      duration: 60000, // 50 jobs per minute
    },
  });

  logger.info('Job workers initialized successfully');
}

/**
 * Export job processors for testing
 */
export { processSendRequestJob } from './send-request';
