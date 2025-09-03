import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger, loggers } from '../lib/logger';
import { getReviewRequestById, updateReviewRequest } from '../services/review-requests';
import { checkSuppressions } from '../services/suppressions';
import { renderMessage, createPersonalizationData, sendGridService } from '../services/messaging';
import { getContactForChannel } from '../lib/utils';
import type { SendRequestJobData } from '../types/external';

/**
 * Process send-request job for email review requests
 */
export async function processSendRequestJob(job: Job<SendRequestJobData>): Promise<{
  success: boolean;
  messageId?: string;
  status?: string;
  error?: string;
}> {
  const { requestId, retryCount = 0 } = job.data;

  try {
    logger.info('Processing send request job', {
      jobId: job.id,
      requestId,
      retryCount,
    });

    // Get review request with full details
    const requestResult = await getReviewRequestById(requestId);

    if (!requestResult.success || !requestResult.data) {
      throw new Error('Review request not found');
    }

    const reviewRequest = requestResult.data;

    // Skip if already processed
    if (reviewRequest.status !== 'QUEUED') {
      logger.warn('Review request already processed', {
        requestId,
        currentStatus: reviewRequest.status,
      });
      return {
        success: true,
        status: reviewRequest.status,
      };
    }

    // Validate scheduled time for scheduled emails
    if (reviewRequest.scheduledFor) {
      const scheduledTime = new Date(reviewRequest.scheduledFor);
      const now = new Date();
      const timeDifference = scheduledTime.getTime() - now.getTime();

      // Allow some tolerance (5 minutes early) for processing delays
      const tolerance = 5 * 60 * 1000; // 5 minutes in milliseconds

      if (timeDifference > tolerance) {
        // Email is scheduled for the future, shouldn't be processed yet
        logger.warn('Scheduled email processed too early', {
          requestId,
          scheduledFor: scheduledTime.toISOString(),
          currentTime: now.toISOString(),
          timeDifference: `${Math.round(timeDifference / (1000 * 60))} minutes`,
        });

        // Don't throw error, just log and return - let the job queue handle rescheduling
        return {
          success: false,
          error: 'Email scheduled for future delivery',
          status: 'QUEUED',
        };
      }

      // Log successful scheduled execution
      logger.info('Processing scheduled email', {
        requestId,
        scheduledFor: scheduledTime.toISOString(),
        actualProcessTime: now.toISOString(),
        delay: `${Math.abs(Math.round(timeDifference / (1000 * 60)))} minutes ${timeDifference > 0 ? 'early' : 'late'}`,
      });
    }

    // Get business details
    const business = await prisma.business.findUnique({
      where: { id: reviewRequest.businessId },
      select: {
        name: true,
        isActive: true,
        emailCreditsUsed: true,
        emailCreditsLimit: true,
      },
    });

    if (!business || !business.isActive) {
      throw new Error('Business not found or inactive');
    }

    // Check credit limits for email
    if (reviewRequest.channel === 'EMAIL') {
      if (business.emailCreditsUsed >= business.emailCreditsLimit) {
        throw new Error('Email credit limit exceeded');
      }
    }

    // Get contact info
    const contact = getContactForChannel(reviewRequest.customer, reviewRequest.channel);

    if (!contact) {
      throw new Error(`Customer does not have ${reviewRequest.channel.toLowerCase()} contact`);
    }

    // Final suppression check
    const suppressionResult = await checkSuppressions(
      reviewRequest.businessId,
      contact,
      reviewRequest.channel
    );

    if (suppressionResult.success && suppressionResult.data.isSuppressed) {
      // Mark as opted out and don't send
      await updateReviewRequest(requestId, {
        status: 'OPTED_OUT',
        errorMessage: `Contact suppressed: ${suppressionResult.data.reason}`,
      });

      await prisma.event.create({
        data: {
          businessId: reviewRequest.businessId,
          reviewRequestId: requestId,
          type: 'REQUEST_OPTED_OUT',
          source: 'system',
          description: 'Request blocked by suppression',
          metadata: suppressionResult.data,
        },
      });

      return {
        success: true,
        status: 'OPTED_OUT',
      };
    }

    // Get message details from database
    const fullReviewRequest = await prisma.reviewRequest.findUnique({
      where: { id: requestId },
      select: {
        messageContent: true,
        subject: true,
        reviewUrl: true,
        trackingUrl: true,
        trackingUuid: true,
      },
    });

    if (!fullReviewRequest) {
      throw new Error('Review request details not found');
    }

    const template = {
      content: fullReviewRequest.messageContent,
      subject: fullReviewRequest.subject,
    };

    // Create personalization data
    const personalizationData = createPersonalizationData(
      reviewRequest.customer,
      business,
      fullReviewRequest.reviewUrl,
      fullReviewRequest.trackingUrl,
      fullReviewRequest.trackingUuid
    );

    // Render message
    const messageResult = await renderMessage(template, personalizationData, reviewRequest.channel);

    if (!messageResult.success) {
      throw new Error(`Message rendering failed: ${messageResult.error}`);
    }

    const renderedMessage = messageResult.data;

    // Send email via SendGrid service
    if (reviewRequest.channel === 'EMAIL') {
      const customerName =
        `${reviewRequest.customer.firstName} ${reviewRequest.customer.lastName || ''}`.trim();

      const sendResult = await sendGridService.sendReviewRequestEmail(
        contact,
        customerName,
        renderedMessage,
        reviewRequest.businessId,
        requestId
      );

      if (sendResult.success) {
        // Update request status
        await updateReviewRequest(requestId, {
          status: 'SENT',
          sentAt: new Date(),
          externalId: sendResult.messageId,
          retryCount,
        });

        // Update business credit usage
        await prisma.business.update({
          where: { id: reviewRequest.businessId },
          data: { emailCreditsUsed: { increment: 1 } },
        });

        // Log success event
        await prisma.event.create({
          data: {
            businessId: reviewRequest.businessId,
            reviewRequestId: requestId,
            type: 'REQUEST_SENT',
            source: 'system',
            description: 'Email message sent successfully',
            metadata: {
              externalId: sendResult.messageId,
              channel: 'EMAIL',
              deliveryTime: sendResult.deliveryTime,
              retryCount: sendResult.retryCount,
            },
          },
        });

        loggers.business.reviewRequestSent({
          requestId,
          businessId: reviewRequest.businessId,
          channel: 'EMAIL',
          externalId: sendResult.messageId || '',
        });

        return {
          success: true,
          messageId: sendResult.messageId,
          status: 'SENT',
        };
      } else {
        // Handle send failure
        const errorMessage = sendResult.error || 'Email sending failed';

        await updateReviewRequest(requestId, {
          status: 'FAILED',
          errorMessage,
          retryCount,
        });

        // Log failure event
        await prisma.event.create({
          data: {
            businessId: reviewRequest.businessId,
            reviewRequestId: requestId,
            type: 'ERROR_OCCURRED',
            source: 'system',
            description: `Email sending failed: ${errorMessage}`,
            metadata: {
              error: errorMessage,
              channel: 'EMAIL',
              statusCode: sendResult.statusCode,
              retryCount,
            },
          },
        });

        throw new Error(errorMessage);
      }
    } else {
      // Handle SMS (not implemented in this version)
      throw new Error('SMS sending not implemented yet');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Send request job failed', {
      jobId: job.id,
      requestId,
      retryCount,
      error: errorMessage,
    });

    // Update request status on failure
    try {
      await updateReviewRequest(requestId, {
        status: 'FAILED',
        errorMessage,
        retryCount,
      });
    } catch (updateError) {
      logger.error('Failed to update request status after error', {
        requestId,
        error: updateError,
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
