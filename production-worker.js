// Production worker to process send-request jobs using SendGrid with real data
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const sgMail = require('@sendgrid/mail');
const { PrismaClient } = require('@prisma/client');

console.log('Starting production SendGrid worker...');

// Initialize Prisma client
const prisma = new PrismaClient();

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

// Template variables replacement function
function replaceTemplateVariables(content, variables) {
  let result = content;
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  });
  return result;
}

// Create worker for send-request queue
const worker = new Worker(
  'send-request',
  async job => {
    console.log('Processing job:', job.id, job.data);

    try {
      const { requestId } = job.data;

      // Get review request with customer and business data
      const reviewRequest = await prisma.reviewRequest.findUnique({
        where: { id: requestId },
        include: {
          customer: true,
          business: true,
        },
      });

      if (!reviewRequest) {
        throw new Error(`Review request not found: ${requestId}`);
      }

      if (reviewRequest.status !== 'QUEUED') {
        console.log(`Request ${requestId} already processed with status: ${reviewRequest.status}`);
        return { success: true, status: reviewRequest.status };
      }

      // Create template variables
      const variables = {
        firstName: reviewRequest.customer.firstName,
        lastName: reviewRequest.customer.lastName || '',
        businessName: reviewRequest.business.name,
        trackingUrl: reviewRequest.trackingUrl,
        reviewUrl: reviewRequest.reviewUrl,
      };

      // Process message content and subject
      const messageContent = replaceTemplateVariables(reviewRequest.messageContent, variables);
      const subject = replaceTemplateVariables(
        reviewRequest.subject || 'Please share your experience',
        variables
      );

      // Send email via SendGrid
      const msg = {
        to: {
          email: reviewRequest.customer.email,
          name: `${reviewRequest.customer.firstName} ${reviewRequest.customer.lastName || ''}`.trim(),
        },
        from: {
          email: 'notification@review-runner.co.uk',
          name: reviewRequest.business.name,
        },
        subject: subject,
        text: messageContent.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        html: messageContent,
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true },
        },
        customArgs: {
          requestId: requestId,
          businessId: reviewRequest.businessId,
          trackingUuid: reviewRequest.trackingUuid,
        },
      };

      console.log(
        `Sending email to ${reviewRequest.customer.email} for business ${reviewRequest.business.name}`
      );

      const result = await sgMail.send(msg);

      // Update review request status
      await prisma.reviewRequest.update({
        where: { id: requestId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          externalId: `sg_${Date.now()}`,
        },
      });

      // Update business email credits
      await prisma.business.update({
        where: { id: reviewRequest.businessId },
        data: {
          emailCreditsUsed: { increment: 1 },
        },
      });

      // Log event
      await prisma.event.create({
        data: {
          businessId: reviewRequest.businessId,
          reviewRequestId: requestId,
          type: 'REQUEST_SENT',
          source: 'system',
          description: 'Email sent successfully via SendGrid',
          metadata: {
            channel: 'EMAIL',
            recipient: reviewRequest.customer.email,
            subject: subject,
          },
        },
      });

      console.log(`Email sent successfully for request: ${requestId}`);

      return { success: true, messageId: result[0].headers['x-message-id'] || 'unknown' };
    } catch (error) {
      console.error('Failed to process job:', error);

      // Update review request with error
      try {
        const { requestId } = job.data;
        await prisma.reviewRequest.update({
          where: { id: requestId },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
          },
        });

        // Log error event
        await prisma.event.create({
          data: {
            businessId: 'unknown', // We may not have this if the request fetch failed
            reviewRequestId: requestId,
            type: 'ERROR_OCCURRED',
            source: 'system',
            description: `Email sending failed: ${error.message}`,
            metadata: {
              error: error.message,
            },
          },
        });
      } catch (updateError) {
        console.error('Failed to update request status:', updateError);
      }

      throw error;
    }
  },
  {
    connection: redis.duplicate(),
    concurrency: 1,
  }
);

worker.on('completed', (job, result) => {
  console.log('Job completed:', job.id, result);
});

worker.on('failed', (job, err) => {
  console.log('Job failed:', job?.id, err.message);
});

worker.on('error', err => {
  console.error('Worker error:', err);
});

console.log('Production worker started, waiting for jobs...');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Stopping worker...');
  await worker.close();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Stopping worker...');
  await worker.close();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
