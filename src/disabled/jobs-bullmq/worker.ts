import { createWorker } from '../services/job-queue';
import { processSendRequestJob } from './send-request';
import { processSendFollowupJob } from './send-followup';
import { processMonitorReviewsJob } from './monitor-reviews';
import { processWebhookJob } from './process-webhook';
import { logger } from '../lib/logger';
import type {
  SendRequestJobData,
  SendFollowupJobData,
  MonitorReviewsJobData,
  ProcessWebhookJobData,
} from '../types/external';

/**
 * Start all job workers
 */
async function startWorkers() {
  try {
    logger.info('Starting job workers...');

    // Send Request Worker (High Priority - 10)
    createWorker<SendRequestJobData>(
      'send-request',
      async job => {
        return await processSendRequestJob(job);
      },
      {
        concurrency: 5, // Process 5 send requests concurrently
        limiter: {
          max: 50, // Max 50 jobs per minute to avoid rate limits
          duration: 60000,
        },
      }
    );

    // Send Followup Worker (Medium Priority - 5)
    createWorker<SendFollowupJobData>(
      'send-followup',
      async job => {
        return await processSendFollowupJob(job);
      },
      {
        concurrency: 3, // Lower concurrency for follow-ups
        limiter: {
          max: 20, // Max 20 follow-ups per minute
          duration: 60000,
        },
      }
    );

    // Monitor Reviews Worker (Low Priority - 1)
    createWorker<MonitorReviewsJobData>(
      'monitor-reviews',
      async job => {
        return await processMonitorReviewsJob(job);
      },
      {
        concurrency: 1, // Single instance for monitoring
        limiter: {
          max: 10, // Max 10 monitoring jobs per minute
          duration: 60000,
        },
      }
    );

    // Process Webhook Worker (Highest Priority - 15)
    createWorker<ProcessWebhookJobData>(
      'process-webhook',
      async job => {
        return await processWebhookJob(job);
      },
      {
        concurrency: 10, // High concurrency for webhooks
        limiter: {
          max: 100, // Max 100 webhook jobs per minute
          duration: 60000,
        },
      }
    );

    logger.info('All job workers started successfully');

    // Health check interval
    setInterval(async () => {
      await performHealthCheck();
    }, 30000); // Every 30 seconds
  } catch (error) {
    logger.error('Failed to start workers', { error });
    process.exit(1);
  }
}

/**
 * Perform health check on workers and queues
 */
async function performHealthCheck() {
  try {
    const { getQueueStats, getRedisHealth } = await import('../services/job-queue');

    // Check Redis connection
    const redisHealth = await getRedisHealth();
    if (!redisHealth.connected) {
      logger.error('Redis health check failed', { error: redisHealth.error });
      return;
    }

    // Check queue stats
    const queues = ['send-request', 'send-followup', 'monitor-reviews', 'process-webhook'];
    const stats: Record<string, any> = {};

    for (const queueName of queues) {
      stats[queueName] = await getQueueStats(queueName);
    }

    // Log stats if there are any issues
    const hasIssues = Object.values(stats).some(
      (stat: any) => stat.failed > 0 || stat.waiting > 100
    );

    if (hasIssues) {
      logger.warn('Queue health check - issues detected', { stats });
    } else {
      logger.debug('Queue health check - all good', { stats });
    }
  } catch (error) {
    logger.error('Health check failed', { error });
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    const { closeAllQueuesAndWorkers } = await import('../services/job-queue');
    await closeAllQueuesAndWorkers();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', error => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

// Start workers if this file is run directly
if (require.main === module) {
  startWorkers().catch(error => {
    logger.error('Failed to start job worker system', { error });
    process.exit(1);
  });
}

export { startWorkers };
