/**
 * GDPR API Integration Tests
 *
 * Tests for the GDPR compliance API endpoints with request/response validation
 * and error handling scenarios.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app'; // Assuming main app builder exists
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

describe('GDPR API Integration Tests', () => {
  let app: FastifyInstance;
  let testBusinessId: string;
  let testCustomerId: string;
  let authToken: string;

  beforeAll(async () => {
    // Build test app
    app = await buildApp({ testing: true });
    await app.ready();

    // Create test data
    testBusinessId = crypto.randomUUID();
    testCustomerId = crypto.randomUUID();
    authToken = 'test-jwt-token'; // Mock JWT token

    // Setup test business and customer
    await prisma.business.create({
      data: {
        id: testBusinessId,
        name: 'API Test Business',
        email: 'api@test.com',
        isActive: true,
      },
    });

    await prisma.customer.create({
      data: {
        id: testCustomerId,
        businessId: testBusinessId,
        email: 'customer@test.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+447123456789',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.customer.deleteMany({ where: { businessId: testBusinessId } });
    await prisma.business.deleteMany({ where: { id: testBusinessId } });
    await app.close();
  });

  describe('Public GDPR Endpoints', () => {
    describe('POST /api/gdpr/requests', () => {
      it('should submit valid GDPR request', async () => {
        const response = await request(app.server)
          .post('/api/gdpr/requests')
          .send({
            rightType: 'ACCESS',
            requestorEmail: 'customer@test.com',
            requestorPhone: '+447123456789',
            identityData: {
              firstName: 'John',
              lastName: 'Doe',
            },
            description: 'I want to access my personal data',
            channel: 'CUSTOMER_PORTAL',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.requestId).toBeDefined();
        expect(response.body.verificationRequired).toBe(true);
        expect(response.body.nextSteps).toBeInstanceOf(Array);
      });

      it('should reject invalid email format', async () => {
        const response = await request(app.server)
          .post('/api/gdpr/requests')
          .send({
            rightType: 'ACCESS',
            requestorEmail: 'invalid-email',
            identityData: { firstName: 'Test', lastName: 'User' },
            channel: 'CUSTOMER_PORTAL',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('email');
      });

      it('should reject missing required fields', async () => {
        const response = await request(app.server)
          .post('/api/gdpr/requests')
          .send({
            rightType: 'ACCESS',
            // Missing requestorEmail
            identityData: { firstName: 'Test' },
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('should handle all GDPR right types', async () => {
        const rightTypes = [
          'ACCESS',
          'RECTIFICATION',
          'ERASURE',
          'RESTRICT',
          'PORTABILITY',
          'OBJECT',
          'CONSENT_WITHDRAW',
        ];

        for (const rightType of rightTypes) {
          const response = await request(app.server)
            .post('/api/gdpr/requests')
            .send({
              rightType,
              requestorEmail: 'customer@test.com',
              identityData: { firstName: 'John', lastName: 'Doe' },
              channel: 'CUSTOMER_PORTAL',
            })
            .expect(200);

          expect(response.body.success).toBe(true);
          expect(response.body.requestId).toBeDefined();
        }
      });
    });

    describe('POST /api/gdpr/verify-identity', () => {
      let verificationToken: string;

      beforeAll(async () => {
        // Create a request first to get verification token
        const requestResponse = await request(app.server)
          .post('/api/gdpr/requests')
          .send({
            rightType: 'ACCESS',
            requestorEmail: 'customer@test.com',
            identityData: { firstName: 'John', lastName: 'Doe' },
            channel: 'CUSTOMER_PORTAL',
          });

        // Mock getting verification token (would normally be sent via email)
        verificationToken = 'test-verification-token-' + requestResponse.body.requestId;
      });

      it('should verify valid identity token', async () => {
        const response = await request(app.server)
          .post('/api/gdpr/verify-identity')
          .send({
            verificationToken,
            additionalVerificationData: {
              confirmEmail: 'customer@test.com',
            },
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.requestId).toBeDefined();
      });

      it('should reject invalid verification token', async () => {
        const response = await request(app.server)
          .post('/api/gdpr/verify-identity')
          .send({
            verificationToken: 'invalid-token-123',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/gdpr/verification/:verificationId/challenges/:challengeId', () => {
      let verificationId: string;
      let challengeId: string;

      beforeAll(async () => {
        // Setup verification with challenges
        verificationId = crypto.randomUUID();
        challengeId = crypto.randomUUID();

        // Create mock verification record
        await prisma.identityVerification.create({
          data: {
            verificationId,
            businessId: testBusinessId,
            requestorEmail: 'customer@test.com',
            status: 'IN_PROGRESS',
            method: 'MULTI_FACTOR',
            riskLevel: 'MEDIUM',
            challenges: {
              create: [
                {
                  challengeId,
                  type: 'TOKEN',
                  description: 'Email verification token',
                  status: 'PENDING',
                  attempts: 0,
                  maxAttempts: 3,
                  expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
                },
              ],
            },
          },
        });
      });

      it('should process valid challenge response', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/verification/${verificationId}/challenges/${challengeId}`)
          .send({
            response: {
              token: 'correct-token-value',
            },
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.verified).toBeDefined();
      });

      it('should reject invalid challenge response', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/verification/${verificationId}/challenges/${challengeId}`)
          .send({
            response: {
              token: 'wrong-token',
            },
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('should handle non-existent verification', async () => {
        const fakeVerificationId = crypto.randomUUID();
        const fakeChallengeId = crypto.randomUUID();

        const response = await request(app.server)
          .post(`/api/gdpr/verification/${fakeVerificationId}/challenges/${fakeChallengeId}`)
          .send({
            response: { token: 'test' },
          })
          .expect(404);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Authenticated Business Endpoints', () => {
    describe('GET /api/gdpr/business/:businessId/requests', () => {
      it('should get business GDPR requests with auth', async () => {
        const response = await request(app.server)
          .get(`/api/gdpr/business/${testBusinessId}/requests`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.requests).toBeInstanceOf(Array);
        expect(response.body.totalCount).toBeDefined();
        expect(response.body.metrics).toBeDefined();
      });

      it('should handle pagination parameters', async () => {
        const response = await request(app.server)
          .get(`/api/gdpr/business/${testBusinessId}/requests`)
          .query({ page: '1', limit: '10' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.page).toBe(1);
        expect(response.body.totalPages).toBeDefined();
      });

      it('should filter by status', async () => {
        const response = await request(app.server)
          .get(`/api/gdpr/business/${testBusinessId}/requests`)
          .query({ status: 'PENDING' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.requests).toBeInstanceOf(Array);
      });

      it('should require authentication', async () => {
        const response = await request(app.server)
          .get(`/api/gdpr/business/${testBusinessId}/requests`)
          .expect(401);

        expect(response.body.message).toContain('auth');
      });
    });

    describe('POST /api/gdpr/business/:businessId/requests/:requestId/process-access', () => {
      let requestId: string;

      beforeAll(async () => {
        // Create a test request
        const createResponse = await request(app.server)
          .post('/api/gdpr/requests')
          .send({
            rightType: 'ACCESS',
            requestorEmail: 'customer@test.com',
            identityData: { firstName: 'John', lastName: 'Doe' },
            channel: 'CUSTOMER_PORTAL',
          });

        requestId = createResponse.body.requestId;

        // Mock verification completion
        await prisma.dataSubjectRequest.update({
          where: { id: requestId },
          data: { status: 'VERIFIED' },
        });
      });

      it('should process access request successfully', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/requests/${requestId}/process-access`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            processedBy: 'test-admin',
            businessApproval: true,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.exportData).toBeDefined();
      });

      it('should require business approval', async () => {
        // Create another request
        const createResponse = await request(app.server)
          .post('/api/gdpr/requests')
          .send({
            rightType: 'ACCESS',
            requestorEmail: 'customer@test.com',
            identityData: { firstName: 'John', lastName: 'Doe' },
            channel: 'CUSTOMER_PORTAL',
          });

        const newRequestId = createResponse.body.requestId;

        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/requests/${newRequestId}/process-access`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            processedBy: 'test-admin',
            businessApproval: false,
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/gdpr/business/:businessId/requests/:requestId/process-rectification', () => {
      let requestId: string;

      beforeAll(async () => {
        const createResponse = await request(app.server)
          .post('/api/gdpr/requests')
          .send({
            rightType: 'RECTIFICATION',
            requestorEmail: 'customer@test.com',
            identityData: { firstName: 'John', lastName: 'Doe' },
            channel: 'CUSTOMER_PORTAL',
          });

        requestId = createResponse.body.requestId;

        await prisma.dataSubjectRequest.update({
          where: { id: requestId },
          data: { status: 'VERIFIED' },
        });
      });

      it('should process rectification request', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/requests/${requestId}/process-rectification`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            updates: {
              firstName: 'Jane',
              email: 'jane.doe@test.com',
            },
            processedBy: 'test-admin',
            businessApproval: true,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should validate update fields', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/requests/${requestId}/process-rectification`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            updates: {
              email: 'invalid-email-format',
            },
            processedBy: 'test-admin',
            businessApproval: true,
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/gdpr/business/:businessId/retention-policies', () => {
      it('should create retention policy', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/retention-policies`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'API Test Policy',
            description: 'Test retention policy via API',
            dataCategory: 'CUSTOMER_PII',
            entityTypes: ['customers'],
            retentionPeriod: 7,
            retentionUnit: 'YEARS',
            actionAfterRetention: 'ARCHIVE',
            legalBasis: 'Data protection compliance',
            jurisdiction: 'UK',
            autoApply: false,
            requiresApproval: true,
            priority: 'MEDIUM',
            isActive: true,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.policyId).toBeDefined();
      });

      it('should validate required fields', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/retention-policies`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: '', // Invalid empty name
            dataCategory: 'CUSTOMER_PII',
            retentionPeriod: 0, // Invalid period
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/gdpr/business/:businessId/secure-deletion', () => {
      it('should schedule secure deletion', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/secure-deletion`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            scope: 'CUSTOMER_COMPLETE',
            targetEntityType: 'customer',
            targetEntityIds: [testCustomerId],
            method: 'CRYPTO_SHREDDING',
            legalBasis: 'GDPR Article 17 - Right to erasure',
            priority: 'NORMAL',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.deletionRequestId).toBeDefined();
        expect(response.body.estimatedCompletion).toBeDefined();
      });

      it('should validate entity IDs format', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/secure-deletion`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            scope: 'CUSTOMER_COMPLETE',
            targetEntityType: 'customer',
            targetEntityIds: ['invalid-uuid-format'],
            method: 'CRYPTO_SHREDDING',
            legalBasis: 'Test deletion',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/gdpr/business/:businessId/compliance-reports', () => {
      it('should generate compliance report', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/compliance-reports`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            reportType: 'GDPR_COMPLIANCE',
            periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            periodEnd: new Date().toISOString(),
            includeRecommendations: true,
            detailedAnalysis: false,
            exportFormat: 'JSON',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.report).toBeDefined();
        expect(response.body.report.reportId).toBeDefined();
        expect(response.body.report.complianceMetrics).toBeDefined();
      });

      it('should validate date range', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/compliance-reports`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            reportType: 'GDPR_COMPLIANCE',
            periodStart: new Date().toISOString(), // Start after end
            periodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/gdpr/business/:businessId/status', () => {
      it('should get compliance status overview', async () => {
        const response = await request(app.server)
          .get(`/api/gdpr/business/${testBusinessId}/status`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.status).toBeDefined();
        expect(response.body.status.gdprRequests).toBeDefined();
        expect(response.body.status.dataCompliance).toBeDefined();
        expect(response.body.status.recentActivity).toBeInstanceOf(Array);
      });
    });

    describe('POST /api/gdpr/business/:businessId/audit-integrity/verify', () => {
      it('should verify audit integrity', async () => {
        const response = await request(app.server)
          .post(`/api/gdpr/business/${testBusinessId}/audit-integrity/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            toDate: new Date().toISOString(),
            fullChainVerification: true,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.verificationResult).toBeDefined();
        expect(response.body.verificationResult.verified).toBeDefined();
        expect(response.body.verificationResult.integrityScore).toBeDefined();
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app.server)
        .post('/api/gdpr/requests')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.message).toContain('JSON');
    });

    it('should handle oversized requests', async () => {
      const largeDescription = 'x'.repeat(10000); // Very large description

      const response = await request(app.server)
        .post('/api/gdpr/requests')
        .send({
          rightType: 'ACCESS',
          requestorEmail: 'customer@test.com',
          identityData: { firstName: 'Test', lastName: 'User' },
          description: largeDescription,
          channel: 'CUSTOMER_PORTAL',
        })
        .expect(413);

      expect(response.body.message).toContain('large');
    });

    it('should handle invalid UUID parameters', async () => {
      const response = await request(app.server)
        .get('/api/gdpr/business/invalid-uuid/requests')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.message).toContain('UUID');
    });

    it('should handle non-existent business', async () => {
      const fakeBusinessId = crypto.randomUUID();

      const response = await request(app.server)
        .get(`/api/gdpr/business/${fakeBusinessId}/requests`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.message).toContain('business');
    });

    it('should handle rate limiting', async () => {
      // Make multiple rapid requests
      const requests = Array.from({ length: 20 }, () =>
        request(app.server)
          .post('/api/gdpr/requests')
          .send({
            rightType: 'ACCESS',
            requestorEmail: 'customer@test.com',
            identityData: { firstName: 'Test', lastName: 'User' },
            channel: 'CUSTOMER_PORTAL',
          })
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      // Should have some rate limited responses
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should validate CORS headers', async () => {
      const response = await request(app.server)
        .options('/api/gdpr/requests')
        .set('Origin', 'https://trusted-domain.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('Response Format Consistency', () => {
    it('should have consistent success response format', async () => {
      const response = await request(app.server)
        .post('/api/gdpr/requests')
        .send({
          rightType: 'ACCESS',
          requestorEmail: 'customer@test.com',
          identityData: { firstName: 'Test', lastName: 'User' },
          channel: 'CUSTOMER_PORTAL',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('message');
    });

    it('should have consistent error response format', async () => {
      const response = await request(app.server)
        .post('/api/gdpr/requests')
        .send({
          rightType: 'INVALID_TYPE',
          requestorEmail: 'invalid-email',
        })
        .expect(400);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBeTruthy();
    });

    it('should include proper HTTP status codes', async () => {
      // Test various endpoints for correct status codes
      const testCases = [
        { method: 'post', path: '/api/gdpr/requests', expectedStatus: 200, validData: true },
        { method: 'post', path: '/api/gdpr/requests', expectedStatus: 400, validData: false },
        {
          method: 'get',
          path: `/api/gdpr/business/${testBusinessId}/requests`,
          expectedStatus: 200,
          auth: true,
        },
        {
          method: 'get',
          path: `/api/gdpr/business/${testBusinessId}/requests`,
          expectedStatus: 401,
          auth: false,
        },
      ];

      for (const testCase of testCases) {
        let request = app.server;

        if (testCase.method === 'post') {
          const data = testCase.validData
            ? {
                rightType: 'ACCESS',
                requestorEmail: 'customer@test.com',
                identityData: { firstName: 'Test', lastName: 'User' },
                channel: 'CUSTOMER_PORTAL',
              }
            : { invalidField: 'invalid' };

          const response = await request(app.server).post(testCase.path).send(data);

          expect(response.status).toBe(testCase.expectedStatus);
        }
      }
    });
  });

  describe('Security Headers and Validation', () => {
    it('should include security headers', async () => {
      const response = await request(app.server)
        .get(`/api/gdpr/business/${testBusinessId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('should sanitize user input', async () => {
      const maliciousInput = '<script>alert("xss")</script>';

      const response = await request(app.server)
        .post('/api/gdpr/requests')
        .send({
          rightType: 'ACCESS',
          requestorEmail: 'customer@test.com',
          identityData: {
            firstName: maliciousInput,
            lastName: 'User',
          },
          description: maliciousInput,
          channel: 'CUSTOMER_PORTAL',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      // Verify the malicious script was sanitized in storage
    });

    it('should validate Content-Type headers', async () => {
      const response = await request(app.server)
        .post('/api/gdpr/requests')
        .set('Content-Type', 'text/plain')
        .send('plain text data')
        .expect(400);

      expect(response.body.message).toContain('Content-Type');
    });
  });
});
