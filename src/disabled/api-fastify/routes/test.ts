import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { sendSMS, sendTestSMS } from '../../services/twilio';
import { sendEmail, sendTestEmail } from '../../services/sendgrid';
import { getRedisHealth, getQueueStats } from '../../services/job-queue';
import { checkSuppressions } from '../../services/suppressions';
import {
  renderMessage,
  getDefaultTemplate,
  generateMessagePreview,
} from '../../services/messaging';
import type { ApiSuccessResponse, ApiErrorResponse } from '../../types/api';

// Only enable in development
const testRoutes: FastifyPluginAsync = async function (fastify) {
  // Skip test routes in production
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  // Test SMS sending
  const testSMSSchema = z.object({
    to: z.string().min(10),
    message: z.string().optional(),
  });

  fastify.post('/sms', async (request, reply) => {
    try {
      const data = testSMSSchema.parse(request.body);

      const result = await sendTestSMS(data.to, data.message);

      if (result.success) {
        const response: ApiSuccessResponse<typeof result.data> = {
          success: true,
          data: result.data,
        };
        return reply.send(response);
      } else {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'SMS_TEST_FAILED',
            message: result.error,
          },
        };
        return reply.code(400).send(response);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Test email sending
  const testEmailSchema = z.object({
    to: z.string().email(),
    subject: z.string().optional(),
    content: z.string().optional(),
  });

  fastify.post('/email', async (request, reply) => {
    try {
      const data = testEmailSchema.parse(request.body);

      const result = await sendTestEmail(data.to, data.subject, data.content);

      if (result.success) {
        const response: ApiSuccessResponse<typeof result.data> = {
          success: true,
          data: result.data,
        };
        return reply.send(response);
      } else {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'EMAIL_TEST_FAILED',
            message: result.error,
          },
        };
        return reply.code(400).send(response);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Test suppression checking
  const testSuppressionSchema = z.object({
    businessId: z.string().uuid(),
    contact: z.string().min(1),
    channel: z.enum(['SMS', 'EMAIL']).optional(),
  });

  fastify.post('/suppression', async (request, reply) => {
    try {
      const data = testSuppressionSchema.parse(request.body);

      const result = await checkSuppressions(data.businessId, data.contact, data.channel);

      const response: ApiSuccessResponse<typeof result.data> = {
        success: result.success,
        data: result.data,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Test message rendering
  const testRenderSchema = z.object({
    channel: z.enum(['SMS', 'EMAIL']),
    template: z
      .object({
        content: z.string(),
        subject: z.string().optional(),
      })
      .optional(),
    customerName: z.string().default('John Doe'),
    businessName: z.string().default('Test Business'),
  });

  fastify.post('/render', async (request, reply) => {
    try {
      const data = testRenderSchema.parse(request.body);

      const template = data.template || getDefaultTemplate(data.channel);

      const preview = generateMessagePreview(template, data.channel, data.businessName);

      if (preview.success) {
        const response: ApiSuccessResponse<typeof preview.data> = {
          success: true,
          data: preview.data,
        };
        return reply.send(response);
      } else {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'RENDER_FAILED',
            message: preview.error,
          },
        };
        return reply.code(400).send(response);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // System health check
  fastify.get('/health', async (request, reply) => {
    try {
      const [redisHealth, queueStats] = await Promise.all([
        getRedisHealth(),
        Promise.all([
          getQueueStats('send-request'),
          getQueueStats('send-followup'),
          getQueueStats('monitor-reviews'),
          getQueueStats('process-webhook'),
        ]),
      ]);

      const health = {
        redis: redisHealth,
        queues: {
          'send-request': queueStats[0],
          'send-followup': queueStats[1],
          'monitor-reviews': queueStats[2],
          'process-webhook': queueStats[3],
        },
        timestamp: new Date().toISOString(),
      };

      const response: ApiSuccessResponse<typeof health> = {
        success: true,
        data: health,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Health check failed', { error });
      throw error;
    }
  });

  // Create test data
  fastify.post('/create-test-data', async (request, reply) => {
    try {
      // This endpoint helps create test data for development
      const { prisma } = await import('../../lib/prisma');

      // Create test business (you need to provide a real Clerk user ID)
      const testBusiness = await prisma.business.upsert({
        where: { clerkUserId: 'test-clerk-user-id' },
        create: {
          clerkUserId: 'test-clerk-user-id',
          name: 'Test Business Ltd',
          email: 'test@testbusiness.com',
          phone: '+447123456789',
          address: '123 Test Street, London, UK',
          googleReviewUrl: 'https://g.page/test-business/review',
        },
        update: {},
      });

      // Create test customers
      const testCustomers = await prisma.customer.createMany({
        data: [
          {
            businessId: testBusiness.id,
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+447123456789',
          },
          {
            businessId: testBusiness.id,
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
            phone: '+447987654321',
          },
        ],
        skipDuplicates: true,
      });

      const response: ApiSuccessResponse<{
        business: typeof testBusiness;
        customersCreated: number;
      }> = {
        success: true,
        data: {
          business: testBusiness,
          customersCreated: testCustomers.count,
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to create test data', { error });
      throw error;
    }
  });
};

export default testRoutes;
