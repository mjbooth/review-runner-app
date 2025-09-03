import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger, loggers } from '../lib/logger';
import { getRequiredEnvVar } from '../lib/utils';
import type { JobData } from '../types/external';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true,
};

// Use Upstash Redis if URL is provided
if (process.env.REDIS_URL) {
  const redisUrl = getRequiredEnvVar('REDIS_URL');
  Object.assign(redisConfig, {
    host: undefined,
    port: undefined,
    password: undefined,
  });
}

// Create Redis connection for BullMQ
const redis = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
    })
  : new IORedis(redisConfig);

// Job queue instances
const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

/**
 * Get or create a job queue
 */
export function getQueue(queueName: string): Queue {
  if (!queues.has(queueName)) {
    const queue = new Queue(queueName, {
      connection: redis.duplicate(),
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 second delay
        },
      },
    });

    // Queue event handlers
    queue.on('error', error => {
      logger.error('Queue error', { queueName, error });
    });

    queue.on('waiting', job => {
      logger.debug('Job waiting', { queueName, jobId: job.id });
    });

    queue.on('active', job => {
      logger.debug('Job active', { queueName, jobId: job.id });
    });

    queue.on('completed', job => {
      loggers.jobs.completed({
        jobId: job.id!,
        jobName: queueName,
        duration: Date.now() - job.processedOn!,
        result: job.returnvalue,
      });
    });

    queue.on('failed', (job, error) => {
      if (job) {
        loggers.jobs.failed({
          jobId: job.id!,
          jobName: queueName,
          error,
          attempts: job.attemptsMade,
        });
      }
    });

    queues.set(queueName, queue);
    logger.info('Job queue created', { queueName });
  }

  return queues.get(queueName)!;
}

/**
 * Add a job to the queue
 */
export async function addJobToQueue<T extends JobData>(
  queueName: string,
  data: T,
  options?: {
    delay?: number;
    priority?: number;
    attempts?: number;
    removeOnComplete?: number;
    removeOnFail?: number;
  }
): Promise<Job<T>> {
  try {
    const queue = getQueue(queueName);

    const job = await queue.add(queueName, data, {
      ...options,
      timestamp: Date.now(),
    });

    loggers.jobs.started({
      jobId: job.id!,
      jobName: queueName,
      data,
    });

    logger.info('Job added to queue', {
      queueName,
      jobId: job.id,
      delay: options?.delay,
      priority: options?.priority,
    });

    return job;
  } catch (error) {
    logger.error('Failed to add job to queue', { queueName, data, error });
    throw error;
  }
}

/**
 * Create and start a worker for processing jobs
 */
export function createWorker<T extends JobData>(
  queueName: string,
  processor: (job: Job<T>) => Promise<any>,
  options?: {
    concurrency?: number;
    limiter?: {
      max: number;
      duration: number;
    };
  }
): Worker<T> {
  if (workers.has(queueName)) {
    logger.warn('Worker already exists for queue', { queueName });
    return workers.get(queueName)! as Worker<T>;
  }

  const worker = new Worker<T>(
    queueName,
    async (job: Job<T>) => {
      const startTime = Date.now();

      loggers.jobs.started({
        jobId: job.id!,
        jobName: queueName,
        data: job.data,
      });

      try {
        const result = await processor(job);

        const duration = Date.now() - startTime;
        loggers.jobs.completed({
          jobId: job.id!,
          jobName: queueName,
          duration,
          result,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        loggers.jobs.failed({
          jobId: job.id!,
          jobName: queueName,
          error,
          attempts: job.attemptsMade,
        });

        // Log retry information if job will be retried
        if (job.attemptsMade < (job.opts.attempts || 3)) {
          const delay = calculateRetryDelay(job.attemptsMade);
          loggers.jobs.retry({
            jobId: job.id!,
            jobName: queueName,
            attempt: job.attemptsMade + 1,
            delay,
          });
        }

        throw error;
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: options?.concurrency || 5,
      limiter: options?.limiter,
    }
  );

  // Worker event handlers
  worker.on('error', error => {
    logger.error('Worker error', { queueName, error });
  });

  worker.on('active', job => {
    logger.debug('Worker processing job', { queueName, jobId: job.id });
  });

  worker.on('completed', job => {
    logger.debug('Worker completed job', { queueName, jobId: job.id });
  });

  worker.on('failed', (job, error) => {
    logger.error('Worker failed job', {
      queueName,
      jobId: job?.id,
      error: error.message,
      attempts: job?.attemptsMade,
    });
  });

  workers.set(queueName, worker);
  logger.info('Worker created and started', { queueName });

  return worker;
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateRetryDelay(attemptsMade: number): number {
  const baseDelay = 5000; // 5 seconds
  const maxDelay = 300000; // 5 minutes
  const delay = Math.min(baseDelay * Math.pow(2, attemptsMade), maxDelay);

  // Add some jitter to avoid thundering herd
  const jitter = Math.random() * 0.1 * delay;
  return Math.floor(delay + jitter);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  try {
    const queue = getQueue(queueName);

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  } catch (error) {
    logger.error('Failed to get queue stats', { queueName, error });
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }
}

/**
 * Get job by ID
 */
export async function getJobById<T extends JobData>(
  queueName: string,
  jobId: string
): Promise<Job<T> | null> {
  try {
    const queue = getQueue(queueName);
    return (await queue.getJob(jobId)) as Job<T> | null;
  } catch (error) {
    logger.error('Failed to get job by ID', { queueName, jobId, error });
    return null;
  }
}

/**
 * Retry a failed job
 */
export async function retryJob(queueName: string, jobId: string): Promise<boolean> {
  try {
    const job = await getJobById(queueName, jobId);

    if (job && job.isFailed()) {
      await job.retry();
      logger.info('Job retry initiated', { queueName, jobId });
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to retry job', { queueName, jobId, error });
    return false;
  }
}

/**
 * Remove a job from the queue
 */
export async function removeJob(queueName: string, jobId: string): Promise<boolean> {
  try {
    const job = await getJobById(queueName, jobId);

    if (job) {
      await job.remove();
      logger.info('Job removed', { queueName, jobId });
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to remove job', { queueName, jobId, error });
    return false;
  }
}

/**
 * Clean old jobs from queue
 */
export async function cleanQueue(
  queueName: string,
  options: {
    grace?: number; // Time in ms to keep jobs
    limit?: number; // Max number of jobs to clean
    type?: 'completed' | 'failed' | 'active' | 'waiting';
  }
): Promise<number> {
  try {
    const queue = getQueue(queueName);

    const cleaned = await queue.clean(
      options.grace || 24 * 60 * 60 * 1000, // Default: 24 hours
      options.limit || 100, // Default: 100 jobs
      options.type || 'completed'
    );

    logger.info('Queue cleaned', { queueName, cleaned: cleaned.length, ...options });
    return cleaned.length;
  } catch (error) {
    logger.error('Failed to clean queue', { queueName, error });
    return 0;
  }
}

/**
 * Pause a queue
 */
export async function pauseQueue(queueName: string): Promise<void> {
  try {
    const queue = getQueue(queueName);
    await queue.pause();
    logger.info('Queue paused', { queueName });
  } catch (error) {
    logger.error('Failed to pause queue', { queueName, error });
    throw error;
  }
}

/**
 * Resume a paused queue
 */
export async function resumeQueue(queueName: string): Promise<void> {
  try {
    const queue = getQueue(queueName);
    await queue.resume();
    logger.info('Queue resumed', { queueName });
  } catch (error) {
    logger.error('Failed to resume queue', { queueName, error });
    throw error;
  }
}

/**
 * Close all queues and workers
 */
export async function closeAllQueuesAndWorkers(): Promise<void> {
  try {
    logger.info('Closing all queues and workers...');

    // Close all workers
    for (const [name, worker] of workers.entries()) {
      await worker.close();
      logger.info('Worker closed', { queueName: name });
    }

    // Close all queues
    for (const [name, queue] of queues.entries()) {
      await queue.close();
      logger.info('Queue closed', { queueName: name });
    }

    // Close Redis connection
    await redis.quit();

    // Clear maps
    workers.clear();
    queues.clear();

    logger.info('All queues and workers closed successfully');
  } catch (error) {
    logger.error('Failed to close queues and workers', { error });
    throw error;
  }
}

/**
 * Get Redis connection health
 */
export async function getRedisHealth(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    await redis.ping();
    return { connected: true };
  } catch (error) {
    logger.error('Redis health check failed', { error });
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing queues and workers...');
  await closeAllQueuesAndWorkers();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing queues and workers...');
  await closeAllQueuesAndWorkers();
  process.exit(0);
});
