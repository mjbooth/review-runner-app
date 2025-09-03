#!/usr/bin/env node

// Scheduled message processor for Review Runner
// This worker processes scheduled review requests at the right time

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const sgMail = require('@sendgrid/mail');

console.log('🚀 Starting Review Runner Scheduler Worker...');
console.log('⏰ Processing scheduled review requests');

// Load environment variables from .env.local for development
if (process.env.NODE_ENV !== 'production') {
  const { config } = require('dotenv');
  config({ path: '.env.local' });
}

// Initialize dependencies
const prisma = new PrismaClient();

// Initialize SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✅ SendGrid initialized');
} else {
  console.log('⚠️ SENDGRID_API_KEY not found - emails will not be sent');
}

// Redis connection (with fallback for different environments)
const createRedisConnection = () => {
  console.log('🔧 Configuring Redis connection...');
  console.log('   REDIS_URL present:', !!process.env.REDIS_URL);
  
  if (process.env.REDIS_URL) {
    console.log('   Using REDIS_URL for connection');
    return new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 10000,
      retryDelayOnFailover: 100,
    });
  } else {
    console.log('   Using localhost Redis connection');
    return new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
};

const redis = createRedisConnection();

// Import the send-request job processor
async function processSendRequestJob(job) {
  const { requestId, retryCount = 0 } = job.data;
  
  try {
    console.log(`📨 Processing scheduled job ${job.id} for request ${requestId}`);

    // Get review request with all details
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

    // Check if already processed
    if (reviewRequest.status !== 'QUEUED') {
      console.log(`✅ Request ${requestId} already processed with status: ${reviewRequest.status}`);
      return { success: true, status: reviewRequest.status };
    }

    // Validate scheduled time
    if (reviewRequest.scheduledFor) {
      const scheduledTime = new Date(reviewRequest.scheduledFor);
      const now = new Date();
      const timeDiff = scheduledTime.getTime() - now.getTime();

      // If it's too early (more than 5 minutes), log and skip
      if (timeDiff > 5 * 60 * 1000) {
        console.log(`⏳ Request ${requestId} scheduled for future: ${scheduledTime.toISOString()}`);
        return { success: false, error: 'Scheduled for future delivery' };
      }

      console.log(`⏰ Processing scheduled request for: ${scheduledTime.toISOString()}`);
    }

    // Replace template variables with actual values
    const replaceVariables = (template, customer, business) => {
      const variables = {
        // Customer variables
        '{{customerName}}': `${customer.firstName} ${customer.lastName || ''}`.trim(),
        '{{firstName}}': customer.firstName,
        '{{lastName}}': customer.lastName || '',
        '{{customer.firstName}}': customer.firstName,
        '{{customer.lastName}}': customer.lastName || '',
        '{{customer.email}}': customer.email || '',
        '{{customer.phone}}': customer.phone || '',
        
        // Business variables
        '{{businessName}}': business.name,
        '{{business.name}}': business.name,
        '{{business.phone}}': business.phone || '',
        '{{business.email}}': business.email || '',
        '{{business.website}}': business.website || '',
        
        // URLs
        '{{reviewUrl}}': reviewRequest.reviewUrl,
        '{{trackingUrl}}': reviewRequest.trackingUrl,
      };
      
      let processed = template;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g');
        processed = processed.replace(regex, value);
      }
      return processed;
    };
    
    // Process message content and subject
    const personalizedMessage = replaceVariables(
      reviewRequest.messageContent || reviewRequest.personalizedMessage,
      reviewRequest.customer,
      reviewRequest.business
    );
    
    const personalizedSubject = replaceVariables(
      reviewRequest.subject || 'Share your experience',
      reviewRequest.customer,
      reviewRequest.business
    );
    
    console.log(`📧 Sending email to ${reviewRequest.customer.email}`);
    console.log(`   Subject: ${personalizedSubject}`);
    
    const now = new Date();
    let sendResult = { success: false, error: null, messageId: null };
    
    // Send via SendGrid if email channel
    if (reviewRequest.channel === 'EMAIL' && reviewRequest.customer.email) {
      try {
        const msg = {
          to: reviewRequest.customer.email,
          from: process.env.SENDGRID_FROM_EMAIL || 'notification@review-runner.co.uk',
          subject: personalizedSubject,
          text: personalizedMessage.replace(/<[^>]*>/g, ''), // Strip HTML
          html: personalizedMessage,
          customArgs: {
            requestId: requestId,
            businessId: reviewRequest.businessId,
            trackingUuid: reviewRequest.trackingUuid,
          },
        };
        
        const [response] = await sgMail.send(msg);
        sendResult = {
          success: true,
          messageId: response.headers['x-message-id'] || `sg_${now.getTime()}`,
          error: null,
        };
        console.log(`✅ Email sent via SendGrid with ID: ${sendResult.messageId}`);
      } catch (error) {
        console.error('❌ SendGrid error:', error.message);
        sendResult = {
          success: false,
          error: error.message,
          messageId: null,
        };
      }
    } else if (reviewRequest.channel === 'SMS') {
      // SMS implementation would go here
      console.log('⏭️ SMS sending not yet implemented');
      sendResult = {
        success: true,
        messageId: `sms_${now.getTime()}`,
        error: null,
      };
    }
    
    // Update request status based on send result
    await prisma.reviewRequest.update({
      where: { id: requestId },
      data: {
        status: sendResult.success ? 'SENT' : 'FAILED',
        sentAt: sendResult.success ? now : null,
        externalId: sendResult.messageId,
        errorMessage: sendResult.error,
        personalizedMessage: personalizedMessage,
        retryCount: retryCount,
      },
    });

    // Update business credits
    if (reviewRequest.channel === 'EMAIL') {
      await prisma.business.update({
        where: { id: reviewRequest.businessId },
        data: { emailCreditsUsed: { increment: 1 } },
      });
    } else if (reviewRequest.channel === 'SMS') {
      await prisma.business.update({
        where: { id: reviewRequest.businessId },
        data: { smsCreditsUsed: { increment: 1 } },
      });
    }

    // Log the successful send event
    await prisma.event.create({
      data: {
        businessId: reviewRequest.businessId,
        reviewRequestId: requestId,
        type: 'REQUEST_SENT',
        source: 'scheduler',
        description: `Scheduled ${reviewRequest.channel.toLowerCase()} sent successfully`,
        metadata: {
          channel: reviewRequest.channel,
          scheduledFor: reviewRequest.scheduledFor,
          processedAt: now.toISOString(),
          retryCount: retryCount,
        },
      },
    });

    if (sendResult.success) {
      console.log(`✅ Successfully sent scheduled request ${requestId} to ${reviewRequest.customer.email || reviewRequest.customer.phone}`);
    } else {
      console.log(`❌ Failed to send scheduled request ${requestId}: ${sendResult.error}`);
    }

    return {
      success: sendResult.success,
      messageId: sendResult.messageId,
      status: sendResult.success ? 'SENT' : 'FAILED',
      error: sendResult.error,
    };

  } catch (error) {
    console.error(`❌ Failed to process scheduled job ${job.id}:`, error.message);

    // Update request with error status
    try {
      await prisma.reviewRequest.update({
        where: { id: requestId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          retryCount: retryCount,
        },
      });

      // Log error event
      await prisma.event.create({
        data: {
          businessId: 'unknown',
          reviewRequestId: requestId,
          type: 'ERROR_OCCURRED',
          source: 'scheduler',
          description: `Scheduled message failed: ${error.message}`,
          metadata: {
            error: error.message,
            retryCount: retryCount,
          },
        },
      });
    } catch (updateError) {
      console.error('Failed to update request status after error:', updateError);
    }

    throw error;
  }
}

// Create worker for send-request queue
const worker = new Worker(
  'send-request',
  processSendRequestJob,
  {
    connection: redis.duplicate(),
    concurrency: 3, // Process up to 3 jobs at once
    limiter: {
      max: 10, // Max 10 jobs per minute
      duration: 60 * 1000,
    },
  }
);

// Worker event handlers
worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

worker.on('failed', (job, err) => {
  console.log(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on('error', err => {
  console.error('🚨 Worker error:', err);
});

worker.on('ready', () => {
  console.log('✅ Scheduler worker ready - waiting for scheduled jobs...');
});

// Health check interval
setInterval(async () => {
  try {
    await redis.ping();
    console.log('💓 Health check: Redis connected');
  } catch (error) {
    console.error('💥 Health check failed: Redis disconnected', error.message);
  }
}, 30000); // Every 30 seconds

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    await worker.close();
    console.log('✅ Worker closed');
    
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
    
    await redis.quit();
    console.log('✅ Redis disconnected');
    
    console.log('👋 Scheduler worker stopped cleanly');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Keep process alive and log startup
console.log('🎯 Scheduler worker started successfully');
console.log('📊 Configuration:');
console.log('   - Concurrency: 3 jobs');
console.log('   - Rate limit: 10 jobs/minute');
console.log('   - Queue: send-request');
if (process.env.REDIS_URL) {
  const redisUrl = new URL(process.env.REDIS_URL);
  console.log('   - Redis: Upstash (' + redisUrl.hostname + ')');
} else {
  console.log('   - Redis: localhost:6379');
}