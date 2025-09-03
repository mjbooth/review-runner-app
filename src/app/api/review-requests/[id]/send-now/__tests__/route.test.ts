import { type NextRequest } from 'next/server';
import { POST } from '../route';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import { createBusinessScope } from '@/lib/db/businessScoped';
import { logger } from '@/lib/logger';
import { getQueue } from '@/services/job-queue';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth-context');
jest.mock('@/lib/db/businessScoped');
jest.mock('@/lib/logger');
jest.mock('@/services/job-queue');

describe('POST /api/review-requests/[id]/send-now', () => {
  const mockBusinessId = 'business-123';
  const mockRequestId = 'request-123';
  const mockCustomerId = 'customer-123';

  const mockReviewRequest = {
    id: mockRequestId,
    businessId: mockBusinessId,
    customerId: mockCustomerId,
    channel: 'SMS',
    status: 'QUEUED',
    scheduledFor: new Date('2025-02-01T10:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: {
      id: mockCustomerId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+447123456789',
    },
  };

  const mockRequest = {
    headers: new Headers(),
    url: `http://localhost:3000/api/review-requests/${mockRequestId}/send-now`,
  } as unknown as NextRequest;

  const mockParams = { params: { id: mockRequestId } };

  let mockScope: any;
  let mockTransaction: any;
  let mockQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock getBusinessContext
    (getBusinessContext as jest.Mock).mockResolvedValue({ businessId: mockBusinessId });

    // Mock business scope
    mockScope = {
      findUniqueReviewRequest: jest.fn(),
    };
    (createBusinessScope as jest.Mock).mockReturnValue(mockScope);

    // Mock Prisma transaction
    mockTransaction = {
      reviewRequest: {
        update: jest.fn(),
      },
      event: {
        create: jest.fn(),
      },
    };
    (prisma.$transaction as jest.Mock) = jest.fn(async callback => {
      return callback(mockTransaction);
    });

    // Mock queue
    mockQueue = {
      getJobs: jest.fn().mockResolvedValue([]),
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };
    (getQueue as jest.Mock).mockReturnValue(mockQueue);

    // Mock logger
    (logger.info as jest.Mock) = jest.fn();
    (logger.error as jest.Mock) = jest.fn();
  });

  describe('Success Cases', () => {
    it('should successfully convert a scheduled request to immediate send', async () => {
      mockScope.findUniqueReviewRequest.mockResolvedValue(mockReviewRequest);
      mockTransaction.reviewRequest.update.mockResolvedValue({
        ...mockReviewRequest,
        scheduledFor: null,
      });

      const response = await POST(mockRequest, mockParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        data: {
          request: expect.objectContaining({
            id: mockRequestId,
            scheduledFor: null,
          }),
          message: 'Request queued for immediate sending',
        },
      });

      // Verify database operations
      expect(mockScope.findUniqueReviewRequest).toHaveBeenCalledWith({
        where: { id: mockRequestId },
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
        },
      });

      expect(mockTransaction.reviewRequest.update).toHaveBeenCalledWith({
        where: { id: mockRequestId },
        data: { scheduledFor: null },
        include: expect.any(Object),
      });

      expect(mockTransaction.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId: mockBusinessId,
          reviewRequestId: mockRequestId,
          type: 'REQUEST_QUEUED',
          source: 'user',
          description: 'Scheduled request converted to immediate send by user',
        }),
      });

      // Verify queue operations
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-request',
        {
          requestId: mockRequestId,
          retryCount: 0,
        },
        {
          priority: 10,
          removeOnComplete: 10,
          removeOnFail: 5,
        }
      );
    });

    it('should remove old scheduled job when converting to immediate', async () => {
      const mockOldJob = {
        id: 'old-job-123',
        data: { requestId: mockRequestId },
        remove: jest.fn(),
      };

      mockScope.findUniqueReviewRequest.mockResolvedValue(mockReviewRequest);
      mockTransaction.reviewRequest.update.mockResolvedValue({
        ...mockReviewRequest,
        scheduledFor: null,
      });
      mockQueue.getJobs.mockResolvedValue([mockOldJob]);

      const response = await POST(mockRequest, mockParams);

      expect(response.status).toBe(200);
      expect(mockQueue.getJobs).toHaveBeenCalledWith(['delayed'], 0, 1000);
      expect(mockOldJob.remove).toHaveBeenCalled();
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 if request ID is missing', async () => {
      const invalidParams = { params: { id: '' } };

      const response = await POST(mockRequest, invalidParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request ID is required',
        },
      });
    });

    it('should return 404 if review request not found', async () => {
      mockScope.findUniqueReviewRequest.mockResolvedValue(null);

      const response = await POST(mockRequest, mockParams);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Review request not found',
        },
      });
    });

    it('should return 400 if request is not scheduled', async () => {
      mockScope.findUniqueReviewRequest.mockResolvedValue({
        ...mockReviewRequest,
        scheduledFor: null,
      });

      const response = await POST(mockRequest, mockParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request is not scheduled or already processed',
        },
      });
    });

    it('should return 400 if request status is not QUEUED', async () => {
      mockScope.findUniqueReviewRequest.mockResolvedValue({
        ...mockReviewRequest,
        status: 'SENT',
      });

      const response = await POST(mockRequest, mockParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request is not scheduled or already processed',
        },
      });
    });
  });

  describe('Queue Error Handling', () => {
    it('should revert database changes if queue operations fail', async () => {
      mockScope.findUniqueReviewRequest.mockResolvedValue(mockReviewRequest);
      mockTransaction.reviewRequest.update.mockResolvedValue({
        ...mockReviewRequest,
        scheduledFor: null,
      });

      // Mock queue error
      mockQueue.add.mockRejectedValue(new Error('Queue connection failed'));

      // Mock the revert update
      (prisma.reviewRequest.update as jest.Mock) = jest.fn();

      const response = await POST(mockRequest, mockParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        success: false,
        error: {
          code: 'QUEUE_ERROR',
          message: 'Failed to queue request for immediate sending',
        },
      });

      // Verify revert was called
      expect(prisma.reviewRequest.update).toHaveBeenCalledWith({
        where: { id: mockRequestId },
        data: {
          scheduledFor: mockReviewRequest.scheduledFor,
        },
      });
    });

    it('should handle missing queue gracefully', async () => {
      (getQueue as jest.Mock).mockReturnValue(null);

      mockScope.findUniqueReviewRequest.mockResolvedValue(mockReviewRequest);
      mockTransaction.reviewRequest.update.mockResolvedValue({
        ...mockReviewRequest,
        scheduledFor: null,
      });

      const response = await POST(mockRequest, mockParams);
      const data = await response.json();

      // Should succeed even without queue
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockScope.findUniqueReviewRequest.mockRejectedValue(new Error('Database connection failed'));

      const response = await POST(mockRequest, mockParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to send request immediately',
        },
      });

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle authentication errors', async () => {
      (getBusinessContext as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

      const response = await POST(mockRequest, mockParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to send request immediately',
        },
      });
    });
  });

  describe('Business Scope', () => {
    it('should respect business scope when finding review request', async () => {
      const differentBusinessRequest = {
        ...mockReviewRequest,
        businessId: 'different-business-123',
      };

      // Mock a different business context
      (getBusinessContext as jest.Mock).mockResolvedValue({ businessId: 'different-business-123' });

      mockScope.findUniqueReviewRequest.mockResolvedValue(differentBusinessRequest);
      mockTransaction.reviewRequest.update.mockResolvedValue({
        ...differentBusinessRequest,
        scheduledFor: null,
      });

      const response = await POST(mockRequest, mockParams);

      expect(response.status).toBe(200);
      expect(createBusinessScope).toHaveBeenCalledWith('different-business-123');
    });
  });

  describe('Logging', () => {
    it('should log successful operations', async () => {
      mockScope.findUniqueReviewRequest.mockResolvedValue(mockReviewRequest);
      mockTransaction.reviewRequest.update.mockResolvedValue({
        ...mockReviewRequest,
        scheduledFor: null,
      });

      await POST(mockRequest, mockParams);

      expect(logger.info).toHaveBeenCalledWith(
        'Successfully queued request for immediate sending',
        expect.objectContaining({
          requestId: mockRequestId,
          businessId: mockBusinessId,
          customerId: mockCustomerId,
          originalScheduledFor: mockReviewRequest.scheduledFor,
        })
      );
    });

    it('should log errors with context', async () => {
      const error = new Error('Test error');
      mockScope.findUniqueReviewRequest.mockRejectedValue(error);

      await POST(mockRequest, mockParams);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send request immediately',
        expect.objectContaining({
          requestId: mockRequestId,
          error: 'Test error',
          stack: expect.any(String),
        })
      );
    });
  });
});
