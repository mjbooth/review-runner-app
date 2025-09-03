import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

// Test database setup
const prisma = new PrismaClient();

// Generate unique test database name
const testDbName = `test_review_runner_${randomBytes(4).toString('hex')}`;

beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = `postgresql://prisma.ahoceglhlpghqaavmalq:-Cxd2n4!mVrMdFD2e26Y@aws-1-eu-west-2.pooler.supabase.com:6543/${testDbName}?pgbouncer=true&connection_limit=1&pool_timeout=0&sslmode=require`;
  process.env.REDIS_URL = 'redis://localhost:6379/15'; // Use different Redis DB for tests
  process.env.SENDGRID_API_KEY = 'test-key';
  process.env.TWILIO_ACCOUNT_SID = 'test-sid';
  process.env.TWILIO_AUTH_TOKEN = 'test-token';

  // Run database migrations for test database
  try {
    execSync('npx prisma db push --force-reset', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });
    console.log('Test database setup complete');
  } catch (error) {
    console.warn('Database setup failed, using existing database');
  }
});

afterAll(async () => {
  // Clean up database connections
  await prisma.$disconnect();

  // Note: In production, you might want to drop the test database here
  // but for now we'll leave it for inspection
});

// Global test utilities
global.testUtils = {
  prisma,

  // Create test business
  async createTestBusiness(overrides = {}) {
    return prisma.business.create({
      data: {
        name: 'Test Business',
        email: 'test@business.com',
        clerkUserId: 'test_clerk_id',
        isActive: true,
        ...overrides,
      },
    });
  },

  // Create test customer
  async createTestCustomer(businessId: string, overrides = {}) {
    return prisma.customer.create({
      data: {
        businessId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+447123456789',
        isActive: true,
        ...overrides,
      },
    });
  },

  // Create test review request
  async createTestReviewRequest(businessId: string, customerId: string, overrides = {}) {
    return prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        channel: 'EMAIL',
        status: 'QUEUED',
        subject: 'Test Review Request',
        messageContent: 'Please leave us a review!',
        reviewUrl: 'https://example.com/review',
        trackingUuid: `test-uuid-${Date.now()}`,
        trackingUrl: `http://localhost:3001/r/test-uuid-${Date.now()}`,
        scheduledFor: new Date(),
        ...overrides,
      },
    });
  },

  // Clean up all test data
  async cleanup() {
    try {
      await prisma.event.deleteMany();
    } catch (error) {
      // Ignore if table doesn't exist
    }
    try {
      await prisma.reviewRequest.deleteMany();
    } catch (error) {
      // Ignore if table doesn't exist
    }
    try {
      await prisma.customer.deleteMany();
    } catch (error) {
      // Ignore if table doesn't exist
    }
    try {
      await prisma.business.deleteMany();
    } catch (error) {
      // Ignore if table doesn't exist
    }
    try {
      await prisma.suppression.deleteMany();
    } catch (error) {
      // Ignore if table doesn't exist
    }
  },
};

// Add type definitions for global test utils
declare global {
  var testUtils: {
    prisma: PrismaClient;
    createTestBusiness: (overrides?: any) => Promise<any>;
    createTestCustomer: (businessId: string, overrides?: any) => Promise<any>;
    createTestReviewRequest: (
      businessId: string,
      customerId: string,
      overrides?: any
    ) => Promise<any>;
    cleanup: () => Promise<void>;
  };
}
