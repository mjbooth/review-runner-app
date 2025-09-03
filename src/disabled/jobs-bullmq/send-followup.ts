import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { createReviewRequest } from '../services/review-requests';
import type { SendFollowupJobData } from '../types/external';

/**
 * Process send-followup job
 */
export async function processSendFollowupJob(job: Job<SendFollowupJobData>): Promise<{
  success: boolean;
  newRequestId?: string;
  status?: string;
  error?: string;
}> {
  const { requestId, followupType } = job.data;

  try {
    logger.info('Processing send followup job', {
      jobId: job.id,
      requestId,
      followupType,
    });

    // Get original review request
    const originalRequest = await prisma.reviewRequest.findFirst({
      where: {
        id: requestId,
        isActive: true,
      },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        business: {
          select: {
            name: true,
            isActive: true,
          },
        },
      },
    });

    if (!originalRequest) {
      throw new Error('Original review request not found');
    }

    if (!originalRequest.business.isActive) {
      throw new Error('Business is not active');
    }

    // Check if already completed or opted out
    if (['COMPLETED', 'OPTED_OUT'].includes(originalRequest.status)) {
      logger.info('Skipping followup - request already completed or opted out', {
        requestId,
        status: originalRequest.status,
      });

      return {
        success: true,
        status: 'skipped',
      };
    }

    // Check if followup was already sent
    if (originalRequest.followupSentAt) {
      logger.info('Skipping followup - already sent', {
        requestId,
        followupSentAt: originalRequest.followupSentAt,
      });

      return {
        success: true,
        status: 'already_sent',
      };
    }

    // Generate followup message based on type
    const followupMessages = {
      first: {
        SMS: `Hi {{firstName}}, we'd still love your feedback! Please share your experience with {{businessName}}: {{reviewUrl}}\n\nReply STOP to opt out.`,
        EMAIL: 'Follow-up: Share Your Experience with {{businessName}}',
      },
      second: {
        SMS: `{{firstName}}, your review would really help {{businessName}}! {{reviewUrl}}\n\nReply STOP to opt out.`,
        EMAIL: 'Final Request: Your Review Matters to {{businessName}}',
      },
      final: {
        SMS: `Last chance {{firstName}} - help others discover {{businessName}}: {{reviewUrl}}\n\nReply STOP to opt out.`,
        EMAIL: 'Final Reminder: Share Your {{businessName}} Experience',
      },
    };

    const messageTemplate = followupMessages[followupType];
    const messageContent =
      originalRequest.channel === 'SMS'
        ? messageTemplate.SMS
        : getFollowupEmailTemplate(followupType);

    const subject = originalRequest.channel === 'EMAIL' ? messageTemplate.EMAIL : undefined;

    // Create followup request
    const followupResult = await createReviewRequest({
      businessId: originalRequest.businessId,
      customerId: originalRequest.customerId,
      channel: originalRequest.channel,
      subject,
      messageContent,
      reviewUrl: originalRequest.reviewUrl,
      scheduledFor: new Date(), // Send immediately
    });

    if (!followupResult.success) {
      throw new Error(`Failed to create followup request: ${followupResult.error}`);
    }

    // Update original request to mark followup as sent
    await prisma.reviewRequest.update({
      where: { id: requestId },
      data: {
        status: 'FOLLOWUP_SENT',
        followupSentAt: new Date(),
      },
    });

    // Log followup event
    await prisma.event.create({
      data: {
        businessId: originalRequest.businessId,
        reviewRequestId: requestId,
        type: 'FOLLOWUP_SENT',
        source: 'system',
        description: `${followupType} followup sent`,
        metadata: {
          followupType,
          newRequestId: followupResult.data.id,
          channel: originalRequest.channel,
        },
      },
    });

    logger.info('Followup request created successfully', {
      originalRequestId: requestId,
      newRequestId: followupResult.data.id,
      followupType,
      channel: originalRequest.channel,
    });

    return {
      success: true,
      newRequestId: followupResult.data.id,
      status: 'sent',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Send followup job failed', {
      jobId: job.id,
      requestId,
      followupType,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get HTML email template for followup
 */
function getFollowupEmailTemplate(followupType: 'first' | 'second' | 'final'): string {
  const templates = {
    first: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Follow-up: Share Your Experience</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
        .container { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .button { display: inline-block; background: #0ea5e9; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; text-align: center; }
        .unsubscribe { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Hi {{firstName}},</h2>
        <p>We hope you're doing well! We wanted to follow up on your recent experience with {{businessName}}.</p>
        <p>Your feedback is incredibly valuable to us and helps other customers make informed decisions. If you have a moment, we'd really appreciate it if you could share your thoughts.</p>
        <div style="text-align: center;">
            <a href="{{trackingUrl}}" class="button">Leave Your Review</a>
        </div>
        <p>Thank you for your time and for choosing {{businessName}}!</p>
        <div class="footer">
            <p>Best regards,<br>The {{businessName}} Team</p>
        </div>
        <div class="unsubscribe">
            <p><a href="{{unsubscribeUrl}}">Unsubscribe from review requests</a></p>
        </div>
    </div>
</body>
</html>`,

    second: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Review Would Mean a Lot</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
        .container { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .button { display: inline-block; background: #0ea5e9; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; text-align: center; }
        .unsubscribe { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Hi {{firstName}},</h2>
        <p>We're reaching out one more time because your opinion really matters to us.</p>
        <p>As a small business, every review helps us grow and improve. Your experience with {{businessName}} could help someone else discover what we have to offer.</p>
        <p>It would mean the world to us if you could take just a minute to share your thoughts.</p>
        <div style="text-align: center;">
            <a href="{{trackingUrl}}" class="button">Share Your Experience</a>
        </div>
        <p>Thank you so much for considering it!</p>
        <div class="footer">
            <p>Gratefully,<br>The {{businessName}} Team</p>
        </div>
        <div class="unsubscribe">
            <p><a href="{{unsubscribeUrl}}">Unsubscribe from review requests</a></p>
        </div>
    </div>
</body>
</html>`,

    final: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Final Request - Your Review Matters</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
        .container { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .button { display: inline-block; background: #0ea5e9; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; text-align: center; }
        .unsubscribe { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Hi {{firstName}},</h2>
        <p>This will be our final request for a review of your experience with {{businessName}}.</p>
        <p>We understand you're busy, but if you have just one minute to spare, your review would be incredibly meaningful to us as a small business.</p>
        <p>Whether your experience was amazing, good, or even if there's something we could improve - we'd love to hear from you.</p>
        <div style="text-align: center;">
            <a href="{{trackingUrl}}" class="button">Leave Final Review</a>
        </div>
        <p>Thank you for your time, and thank you for choosing {{businessName}}.</p>
        <div class="footer">
            <p>With appreciation,<br>The {{businessName}} Team</p>
        </div>
        <div class="unsubscribe">
            <p><a href="{{unsubscribeUrl}}">Unsubscribe from review requests</a></p>
        </div>
    </div>
</body>
</html>`,
  };

  return templates[followupType];
}
