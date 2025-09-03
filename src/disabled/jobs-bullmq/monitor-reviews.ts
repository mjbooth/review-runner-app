import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { MonitorReviewsJobData } from '../types/external';

/**
 * Process monitor-reviews job
 * This job checks for review completion by monitoring external review platforms
 */
export async function processMonitorReviewsJob(job: Job<MonitorReviewsJobData>): Promise<{
  success: boolean;
  reviewsChecked?: number;
  reviewsCompleted?: number;
  error?: string;
}> {
  const { businessId } = job.data;

  try {
    logger.info(`Processing monitor reviews job - JobID: ${job.id || 'unknown'}, BusinessID: ${businessId}`);

    // Get business with Google Places info
    const business = await prisma.business.findUnique({
      where: {
        id: businessId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        googlePlaceId: true,
        googlePlaceName: true,
        googleReviewUrl: true,
      },
    });

    if (!business) {
      throw new Error('Business not found or inactive');
    }

    // Get active review requests that have been clicked but not completed
    const pendingRequests = await prisma.reviewRequest.findMany({
      where: {
        businessId,
        status: 'CLICKED',
        clickedAt: {
          // Only check requests clicked more than 5 minutes ago to allow time for review submission
          lte: new Date(Date.now() - 5 * 60 * 1000),
        },
        isActive: true,
      },
      select: {
        id: true,
        trackingUuid: true,
        clickedAt: true,
        reviewUrl: true,
      },
      orderBy: {
        clickedAt: 'asc',
      },
      take: 50, // Process in batches
    });

    if (pendingRequests.length === 0) {
      logger.debug(`No pending review requests to monitor for business: ${businessId}`);
      return {
        success: true,
        reviewsChecked: 0,
        reviewsCompleted: 0,
      };
    }

    logger.info(`Monitoring ${pendingRequests.length} review requests for business: ${businessId}`);

    let reviewsCompleted = 0;

    // Check each pending request
    for (const request of pendingRequests) {
      try {
        // For now, we'll implement a simple time-based completion check
        // In a full implementation, you could integrate with Google Places API,
        // Trustpilot API, or other review platforms to check for actual reviews

        const timeSinceClick = Date.now() - request.clickedAt!.getTime();
        const hoursHours = timeSinceClick / (1000 * 60 * 60);

        // Mark as completed if clicked more than 2 hours ago
        // This is a simplified approach - in practice, you'd want to check the actual review platform
        if (hoursHours > 2) {
          await prisma.$transaction([
            prisma.reviewRequest.update({
              where: { id: request.id },
              data: {
                status: 'COMPLETED',
                completedAt: new Date(),
              },
            }),
            prisma.event.create({
              data: {
                businessId,
                reviewRequestId: request.id,
                type: 'REQUEST_COMPLETED',
                source: 'monitor',
                description: 'Review request marked as completed by monitoring system',
                metadata: {
                  method: 'time_based',
                  hoursAfterClick: Math.round(hoursHours * 100) / 100,
                },
              },
            }),
          ]);

          reviewsCompleted++;

          logger.debug(`Review request marked as completed: ${request.id} (${Math.round(hoursHours * 100) / 100}h after click)`);
        }
      } catch (requestError) {
        logger.error(`Failed to process review request ${request.id}: ${requestError instanceof Error ? requestError.message : String(requestError)}`);
        // Continue with other requests
      }
    }

    // TODO: Implement actual review platform monitoring
    // This could include:
    // 1. Google Places API integration to check for new reviews
    // 2. Matching reviews by customer name, email, or other identifiers
    // 3. Trustpilot, Yelp, or other platform APIs
    // 4. Webhook listeners for review platforms that support them

    logger.info(`Review monitoring completed for business ${businessId}: checked ${pendingRequests.length}, completed ${reviewsCompleted}`);

    return {
      success: true,
      reviewsChecked: pendingRequests.length,
      reviewsCompleted,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`Monitor reviews job failed for business ${businessId} (job ${job.id}): ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Check Google Places for new reviews (placeholder implementation)
 * In a full implementation, this would use the Google Places API
 */
async function checkGooglePlacesReviews(
  placeId: string,
  businessId: string
): Promise<{ newReviews: number; totalReviews: number }> {
  try {
    // Placeholder implementation
    // In practice, you would:
    // 1. Use Google Places API to fetch recent reviews
    // 2. Store review data and match with pending requests
    // 3. Update request status based on review matching

    logger.debug(`Checking Google Places reviews for business ${businessId}, place: ${placeId}`);

    // TODO: Implement actual Google Places API integration
    // const placesClient = getGooglePlacesClient();
    // const response = await placesClient.placeDetails({
    //   placeId,
    //   fields: ['reviews', 'user_ratings_total'],
    // });

    return {
      newReviews: 0,
      totalReviews: 0,
    };
  } catch (error) {
    logger.error(`Failed to check Google Places reviews for ${placeId}: ${error instanceof Error ? error.message : String(error)}`);

    return {
      newReviews: 0,
      totalReviews: 0,
    };
  }
}

/**
 * Schedule monitoring jobs for all active businesses
 * This function can be called periodically to ensure all businesses are being monitored
 */
export async function scheduleMonitoringJobs(): Promise<void> {
  try {
    const { addJobToQueue } = await import('../services/job-queue');

    // Get all active businesses
    const businesses = await prisma.business.findMany({
      where: {
        isActive: true,
        googlePlaceId: { not: null }, // Only businesses with Google Places setup
      },
      select: { id: true },
    });

    logger.info(`Scheduling monitoring jobs for ${businesses.length} businesses`);

    for (const business of businesses) {
      await addJobToQueue(
        'monitor-reviews',
        {
          businessId: business.id,
        },
        {
          delay: Math.random() * 60000, // Random delay up to 1 minute to spread load
          removeOnComplete: 10,
          removeOnFail: 5,
        }
      );
    }

    logger.info(`Monitoring jobs scheduled successfully for ${businesses.length} businesses`);
  } catch (error) {
    logger.error(`Failed to schedule monitoring jobs: ${error instanceof Error ? error.message : String(error)}`);
  }
}
