import type { FastifyPluginAsync } from 'fastify';
import { logger } from '../../lib/logger';
import {
  getReviewRequestByTrackingUuid,
  markReviewRequestClicked,
} from '../../services/review-requests';
import { handleWebhookSuppression } from '../../services/suppressions';

const redirectRoutes: FastifyPluginAsync = async function (fastify) {
  // Handle review request redirects with tracking
  fastify.get('/:uuid', async (request, reply) => {
    try {
      const { uuid } = request.params as { uuid: string };

      // Get client information for tracking
      const userAgent = request.headers['user-agent'];
      const ipAddress = request.ip;

      // Get review request by tracking UUID
      const requestResult = await getReviewRequestByTrackingUuid(uuid);

      if (!requestResult.success || !requestResult.data) {
        logger.warn('Invalid tracking link accessed: ' + uuid + ' from ' + ipAddress);
        return reply.code(404).type('text/html').send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Link Not Found</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #e74c3c; }
              .container { max-width: 500px; margin: 0 auto; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Link Not Found</h1>
              <p>This review link is invalid or has expired.</p>
              <p>If you believe this is an error, please contact the business directly.</p>
            </div>
          </body>
          </html>
        `);
      }

      const reviewRequest = requestResult.data;

      // Track the click if not already clicked
      if (reviewRequest.status !== 'CLICKED' && reviewRequest.status !== 'COMPLETED') {
        const clickResult = await markReviewRequestClicked(reviewRequest.id, {
          ...(userAgent && { userAgent }),
          ipAddress,
        });

        if (!clickResult.success) {
          logger.error('Failed to mark request as clicked: ' + reviewRequest.id + ' - ' + clickResult.error);
        }
      }

      // TODO: Add analytics pixel or tracking code here if needed

      // Redirect to the actual review URL
      return reply.redirect(reviewRequest.reviewUrl);
    } catch (error) {
      logger.error('Redirect handling error: ' + (error instanceof Error ? error.message : String(error)));
      return reply.code(500).type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #e74c3c; }
            .container { max-width: 500px; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Something went wrong</h1>
            <p>We're sorry, but there was an error processing your request.</p>
            <p>Please try again later or contact support if the problem persists.</p>
          </div>
        </body>
        </html>
      `);
    }
  });

  // Unsubscribe handling for email campaigns
  fastify.get('/unsubscribe/:uuid', async (request, reply) => {
    try {
      const { uuid } = request.params as { uuid: string };
      const userAgent = request.headers['user-agent'];
      const ipAddress = request.ip;

      // Get review request by tracking UUID
      const requestResult = await getReviewRequestByTrackingUuid(uuid);

      if (!requestResult.success || !requestResult.data) {
        return reply.code(404).type('text/html').send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Unsubscribe - Link Not Found</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .container { max-width: 500px; margin: 0 auto; }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Link Not Found</h1>
              <p>This unsubscribe link is invalid or has expired.</p>
            </div>
          </body>
          </html>
        `);
      }

      const reviewRequest = requestResult.data;

      // Determine contact info based on channel
      const contact =
        reviewRequest.channel === 'EMAIL'
          ? reviewRequest.customer.email
          : reviewRequest.customer.phone;

      if (!contact) {
        logger.warn('No contact info for unsubscribe: ' + reviewRequest.id);
        return reply.code(400).type('text/html').send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Invalid Request</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <h1>Invalid unsubscribe request</h1>
            <p>Unable to process this unsubscribe request.</p>
          </body>
          </html>
        `);
      }

      // Handle suppression via service
      const suppressionResult = await handleWebhookSuppression(
        reviewRequest.businessId,
        contact,
        reviewRequest.channel,
        reviewRequest.channel === 'EMAIL' ? 'EMAIL_UNSUBSCRIBE' : 'SMS_STOP',
        'unsubscribe_link',
        {
          userAgent,
          ipAddress,
          trackingUuid: uuid,
        }
      );

      if (!suppressionResult.success) {
        logger.error('Failed to process unsubscribe: ' + reviewRequest.id + ' - ' + suppressionResult.error);
      }

      logger.info('Customer unsubscribed via link: ' + reviewRequest.id + ' business: ' + reviewRequest.businessId + ' channel: ' + reviewRequest.channel);

      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Unsubscribed Successfully</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px; 
              background: #f8f9fa;
            }
            .container { 
              max-width: 500px; 
              margin: 0 auto; 
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #28a745; margin-bottom: 20px; }
            p { color: #6c757d; line-height: 1.6; }
            .icon { font-size: 48px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✅</div>
            <h1>Successfully Unsubscribed</h1>
            <p>You have been successfully unsubscribed from our review request messages.</p>
            <p>You will no longer receive review requests via ${reviewRequest.channel === 'EMAIL' ? 'email' : 'SMS'} from this business.</p>
            <p>If you have any questions, please contact the business directly.</p>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      logger.error('Unsubscribe handling error: ' + (error instanceof Error ? error.message : String(error)));
      return reply.code(500).type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <h1>Error processing request</h1>
          <p>We're sorry, but there was an error processing your unsubscribe request.</p>
          <p>Please try again later or contact support.</p>
        </body>
        </html>
      `);
    }
  });
};

export default redirectRoutes;
