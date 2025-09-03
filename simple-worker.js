// Simple worker to process send-request jobs using SendGrid
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const sgMail = require('@sendgrid/mail');

console.log('Starting simple SendGrid worker...');

// Configure SendGrid
const sendgridApiKey = process.env.SENDGRID_API_KEY;
if (!sendgridApiKey) {
  console.error('SENDGRID_API_KEY environment variable is required');
  process.exit(1);
}
sgMail.setApiKey(sendgridApiKey);

// Redis connection
const redis = new IORedis('redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

// Create worker for send-request queue
const worker = new Worker(
  'send-request',
  async job => {
    console.log('Processing job:', job.id, job.data);

    try {
      const { requestId } = job.data;

      // For now, just send a test email
      const msg = {
        to: 'matt.j.booth@gmail.com',
        from: 'notification@review-runner.co.uk',
        subject: 'Test Review Request',
        text: 'This is a test review request email.',
        html: '<strong>This is a test review request email.</strong>',
      };

      await sgMail.send(msg);

      console.log('Email sent successfully for request:', requestId);

      return { success: true, messageId: 'test-id' };
    } catch (error) {
      console.error('Failed to process job:', error);
      throw error;
    }
  },
  {
    connection: redis.duplicate(),
    concurrency: 1,
  }
);

worker.on('completed', job => {
  console.log('Job completed:', job.id);
});

worker.on('failed', (job, err) => {
  console.log('Job failed:', job?.id, err.message);
});

worker.on('error', err => {
  console.error('Worker error:', err);
});

console.log('Worker started, waiting for jobs...');

// Keep the process running
process.on('SIGINT', async () => {
  console.log('Stopping worker...');
  await worker.close();
  await redis.quit();
  process.exit(0);
});
