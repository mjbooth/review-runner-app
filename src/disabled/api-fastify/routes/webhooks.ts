import type { FastifyPluginAsync } from 'fastify';
import { logger } from '../../lib/logger';
import { addJobToQueue } from '../../services/job-queue';
import { handleTwilioWebhook } from '../../services/twilio';
import { handleSendGridWebhook } from '../../services/sendgrid';

const webhookRoutes: FastifyPluginAsync = async function (fastify) {
  // Twilio SMS webhooks
  fastify.post('/twilio', async (request, reply) => {
    try {
      const body = request.body as any;

      logger.info('Twilio webhook received: ' + (body.MessageSid?.slice(0, 20) + '***') + ' status: ' + body.MessageStatus);

      // Validate webhook payload
      const validationResult = await handleTwilioWebhook(body);

      if (!validationResult.success) {
        logger.warn('Invalid Twilio webhook: ' + validationResult.error);
        return reply.code(400).send({ error: validationResult.error });
      }

      // Queue webhook processing job for background processing
      await addJobToQueue(
        'process-webhook',
        {
          source: 'twilio',
          payload: body,
          timestamp: new Date().toISOString(),
        },
        {
          priority: 15, // High priority for webhooks
          attempts: 3,
          removeOnComplete: 50,
          removeOnFail: 20,
        }
      );

      return reply.code(200).send({ status: 'queued' });
    } catch (error) {
      logger.error('Twilio webhook error: ' + (error instanceof Error ? error.message : String(error)));
      return reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });

  // SendGrid email webhooks
  fastify.post('/sendgrid', async (request, reply) => {
    try {
      const events = request.body as any[];

      if (!Array.isArray(events)) {
        return reply.code(400).send({ error: 'Invalid webhook format' });
      }

      logger.info('SendGrid webhook received with ' + events.length + ' events');

      // Validate webhook payload
      const validationResult = await handleSendGridWebhook(events);

      if (!validationResult.success) {
        logger.warn('Invalid SendGrid webhook: ' + validationResult.error);
        return reply.code(400).send({ error: validationResult.error });
      }

      // Queue webhook processing job for background processing
      await addJobToQueue(
        'process-webhook',
        {
          source: 'sendgrid',
          payload: events,
          timestamp: new Date().toISOString(),
        },
        {
          priority: 15, // High priority for webhooks
          attempts: 3,
          removeOnComplete: 50,
          removeOnFail: 20,
        }
      );

      return reply.code(200).send({ status: 'queued', count: events.length });
    } catch (error) {
      logger.error('SendGrid webhook error: ' + (error instanceof Error ? error.message : String(error)));
      return reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });
};

export default webhookRoutes;
