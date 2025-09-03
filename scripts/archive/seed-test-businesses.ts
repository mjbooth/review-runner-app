#!/usr/bin/env tsx

/**
 * Test Business Seeding Script for Multi-Tenant Testing
 * 
 * Creates 4 test businesses with diverse data profiles:
 * 1. Empty Business - New account with no data
 * 2. High-Volume Business - Established business with lots of data
 * 3. Trial Account - Limited usage, approaching limits
 * 4. Suspended Account - Inactive business for testing edge cases
 */

import { PrismaClient, RequestChannel, RequestStatus, EventType, SuppressionReason } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

// Test business configurations
const TEST_BUSINESSES = [
  {
    id: 'test-empty-business-001',
    clerkUserId: 'test_clerk_empty_001',
    name: 'Fresh Start Cafe',
    email: 'owner@freshstartcafe.co.uk',
    phone: '+44 20 1234 5678',
    address: '123 High Street, London, SW1A 1AA',
    website: 'https://freshstartcafe.co.uk',
    googlePlaceId: 'ChIJ_test_empty_business',
    googlePlaceName: 'Fresh Start Cafe',
    googleReviewUrl: 'https://g.page/r/test-empty-reviews',
    googleMapsUrl: 'https://goo.gl/maps/test-empty',
    googleRating: 4.2,
    googleReviewCount: 8,
    smsCreditsUsed: 0,
    smsCreditsLimit: 100,
    emailCreditsUsed: 0,
    emailCreditsLimit: 500,
    isActive: true,
    customerCount: 0,
    reviewRequestCount: 0,
    suppressionCount: 0,
    description: 'Empty Business - New account with no customers or activity'
  },
  {
    id: 'test-highvolume-business-002', 
    clerkUserId: 'test_clerk_highvolume_002',
    name: 'Metropolitan Dental Practice',
    email: 'reception@metrodental.co.uk',
    phone: '+44 20 9876 5432',
    address: '456 Harley Street, London, W1G 9QH',
    website: 'https://metrodental.co.uk',
    googlePlaceId: 'ChIJ_test_highvolume_business',
    googlePlaceName: 'Metropolitan Dental Practice',
    googleReviewUrl: 'https://g.page/r/test-highvolume-reviews',
    googleMapsUrl: 'https://goo.gl/maps/test-highvolume',
    googleRating: 4.8,
    googleReviewCount: 247,
    smsCreditsUsed: 1847,
    smsCreditsLimit: 5000,
    emailCreditsUsed: 3421,
    emailCreditsLimit: 10000,
    isActive: true,
    customerCount: 89,
    reviewRequestCount: 156,
    suppressionCount: 7,
    description: 'High-Volume Business - Established practice with extensive customer database'
  },
  {
    id: 'test-trial-business-003',
    clerkUserId: 'test_clerk_trial_003', 
    name: 'Artisan Bakery & Cafe',
    email: 'hello@artisanbakery.co.uk',
    phone: '+44 161 234 5678',
    address: '789 Northern Quarter, Manchester, M1 1AA',
    website: 'https://artisanbakery.co.uk',
    googlePlaceId: 'ChIJ_test_trial_business',
    googlePlaceName: 'Artisan Bakery & Cafe',
    googleReviewUrl: 'https://g.page/r/test-trial-reviews',
    googleMapsUrl: 'https://goo.gl/maps/test-trial',
    googleRating: 4.6,
    googleReviewCount: 34,
    smsCreditsUsed: 87,
    smsCreditsLimit: 100,
    emailCreditsUsed: 423,
    emailCreditsLimit: 500,
    isActive: true,
    customerCount: 23,
    reviewRequestCount: 31,
    suppressionCount: 2,
    description: 'Trial Account - Small business approaching usage limits'
  },
  {
    id: 'test-suspended-business-004',
    clerkUserId: 'test_clerk_suspended_004',
    name: 'Vintage Motors (SUSPENDED)',
    email: 'admin@vintagemotors.co.uk',
    phone: '+44 113 987 6543',
    address: '321 Industrial Estate, Leeds, LS1 2AB',
    website: 'https://vintagemotors.co.uk',
    googlePlaceId: 'ChIJ_test_suspended_business',
    googlePlaceName: 'Vintage Motors',
    googleReviewUrl: 'https://g.page/r/test-suspended-reviews',
    googleMapsUrl: 'https://goo.gl/maps/test-suspended',
    googleRating: 4.1,
    googleReviewCount: 67,
    smsCreditsUsed: 234,
    smsCreditsLimit: 1000,
    emailCreditsUsed: 876,
    emailCreditsLimit: 2000,
    isActive: false, // SUSPENDED
    customerCount: 45,
    reviewRequestCount: 78,
    suppressionCount: 12,
    description: 'Suspended Account - Inactive business for testing edge cases'
  }
];

async function createTestCustomers(businessId: string, count: number) {
  const customers = [];
  
  for (let i = 0; i < count; i++) {
    customers.push({
      id: `${businessId}-customer-${String(i + 1).padStart(3, '0')}`,
      businessId,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      phone: faker.phone.number(),
      address: `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.zipCode()}`,
      notes: i % 5 === 0 ? faker.lorem.sentence() : null,
      tags: i % 3 === 0 ? [faker.word.adjective(), faker.word.noun()] : [],
      lastContact: i % 4 === 0 ? faker.date.recent({ days: 30 }) : null,
      isActive: true,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 7 })
    });
  }
  
  return customers;
}

async function createTestReviewRequests(businessId: string, customers: any[], count: number) {
  const reviewRequests = [];
  const statuses: RequestStatus[] = ['SENT', 'DELIVERED', 'CLICKED', 'COMPLETED', 'BOUNCED', 'FAILED'];
  const channels: RequestChannel[] = ['SMS', 'EMAIL'];
  
  for (let i = 0; i < count; i++) {
    const customer = customers[i % customers.length];
    const channel: RequestChannel = channels[i % 2];
    const status: RequestStatus = statuses[i % statuses.length];
    const trackingUuid = `${businessId}-tracking-${String(i + 1).padStart(3, '0')}`;
    
    reviewRequests.push({
      id: `${businessId}-request-${String(i + 1).padStart(3, '0')}`,
      businessId,
      customerId: customer.id,
      channel,
      status,
      subject: channel === 'EMAIL' ? `Please review ${businessId.includes('dental') ? 'your recent appointment' : 'your experience'}` : null,
      messageContent: `Hi ${customer.firstName}, we'd love to hear about your recent experience with us!`,
      reviewUrl: `https://g.page/r/${businessId}-reviews`,
      trackingUrl: `https://reviewrunner.dev/r/${trackingUuid}`,
      trackingUuid,
      scheduledFor: null,
      sentAt: status && ['SENT', 'DELIVERED', 'CLICKED', 'COMPLETED'].includes(status) ? faker.date.past({ years: 1 }) : null,
      deliveredAt: status && ['DELIVERED', 'CLICKED', 'COMPLETED'].includes(status) ? faker.date.past({ years: 1 }) : null,
      clickedAt: status && ['CLICKED', 'COMPLETED'].includes(status) ? faker.date.past({ years: 1 }) : null,
      completedAt: status === 'COMPLETED' ? faker.date.past({ years: 1 }) : null,
      followupSentAt: null,
      externalId: `ext-${businessId}-${i + 1}`,
      errorMessage: status && ['BOUNCED', 'FAILED'].includes(status) ? faker.lorem.words(5) : null,
      retryCount: status && ['FAILED'].includes(status) ? faker.number.int({ min: 1, max: 3 }) : 0,
      metadata: {
        userAgent: faker.internet.userAgent(),
        ipAddress: faker.internet.ip(),
        source: 'test_seed'
      },
      isActive: true,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 7 })
    });
  }
  
  return reviewRequests;
}

async function createTestSuppressions(businessId: string, count: number) {
  const suppressions = [];
  const reasons: SuppressionReason[] = ['SMS_STOP', 'EMAIL_UNSUBSCRIBE', 'EMAIL_BOUNCE', 'MANUAL'];
  const channels: RequestChannel[] = ['SMS', 'EMAIL', 'SMS']; // Removed null for type safety
  
  for (let i = 0; i < count; i++) {
    suppressions.push({
      id: `${businessId}-suppression-${String(i + 1).padStart(3, '0')}`,
      businessId,
      contact: faker.internet.email(),
      channel: channels[i % 3],
      reason: reasons[i % reasons.length],
      source: 'webhook',
      notes: i % 3 === 0 ? faker.lorem.sentence() : null,
      expiresAt: null,
      isActive: true,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 7 })
    });
  }
  
  return suppressions;
}

async function createTestEvents(businessId: string, reviewRequests: any[]) {
  const events = [];
  const eventTypes: EventType[] = ['REQUEST_CREATED', 'REQUEST_SENT', 'REQUEST_DELIVERED', 'REQUEST_CLICKED'];
  const sources = ['system', 'twilio', 'sendgrid'];
  
  // Create events for review requests
  for (const request of reviewRequests) {
    const eventCount = faker.number.int({ min: 1, max: 3 });
    
    for (let i = 0; i < eventCount; i++) {
      events.push({
        id: `${businessId}-event-${request.id}-${i + 1}`,
        businessId,
        reviewRequestId: request.id,
        type: eventTypes[i % eventTypes.length],
        source: sources[i % sources.length] as string,
        description: `${eventTypes[i % eventTypes.length]?.toLowerCase().replace('_', ' ')} for ${request.channel} request`,
        metadata: {
          requestId: request.id,
          channel: request.channel,
          customerName: `${request.customerId.split('-')[2]}-customer`,
          source: 'test_seed'
        },
        ipAddress: faker.internet.ip(),
        userAgent: faker.internet.userAgent(),
        createdAt: faker.date.past({ years: 1 })
      });
    }
  }
  
  return events;
}

async function seedTestBusiness(config: typeof TEST_BUSINESSES[0]) {
  console.log(`\n🏢 Seeding ${config.name}...`);
  
  // Create business
  const business = await prisma.business.create({
    data: {
      id: config.id,
      clerkUserId: config.clerkUserId,
      name: config.name,
      email: config.email,
      phone: config.phone,
      address: config.address,
      website: config.website,
      googlePlaceId: config.googlePlaceId,
      googlePlaceName: config.googlePlaceName,
      googleReviewUrl: config.googleReviewUrl,
      googleMapsUrl: config.googleMapsUrl,
      googleRating: config.googleRating,
      googleReviewCount: config.googleReviewCount,
      googleTypes: ['business', 'establishment'],
      smsCreditsUsed: config.smsCreditsUsed,
      smsCreditsLimit: config.smsCreditsLimit,
      emailCreditsUsed: config.emailCreditsUsed,
      emailCreditsLimit: config.emailCreditsLimit,
      isActive: config.isActive,
      createdAt: faker.date.past({ years: 2 }),
      updatedAt: faker.date.recent({ days: 1 })
    }
  });
  
  console.log(`   ✅ Business created: ${business.name}`);
  
  // Create customers if specified
  if (config.customerCount > 0) {
    const customers = await createTestCustomers(config.id, config.customerCount);
    await prisma.customer.createMany({ data: customers });
    console.log(`   👥 Created ${config.customerCount} customers`);
    
    // Create review requests if specified
    if (config.reviewRequestCount > 0) {
      const reviewRequests = await createTestReviewRequests(config.id, customers, config.reviewRequestCount);
      await prisma.reviewRequest.createMany({ data: reviewRequests });
      console.log(`   📧 Created ${config.reviewRequestCount} review requests`);
      
      // Create events for review requests
      const events = await createTestEvents(config.id, reviewRequests);
      await prisma.event.createMany({ data: events });
      console.log(`   📊 Created ${events.length} events`);
    }
    
    // Create suppressions if specified
    if (config.suppressionCount > 0) {
      const suppressions = await createTestSuppressions(config.id, config.suppressionCount);
      await prisma.suppression.createMany({ data: suppressions });
      console.log(`   🚫 Created ${config.suppressionCount} suppressions`);
    }
  }
  
  console.log(`   📋 ${config.description}`);
  
  return business;
}

async function main() {
  console.log('🌱 Starting test business seeding for multi-tenant testing...\n');
  
  try {
    // Check if test businesses already exist
    const existingBusinesses = await prisma.business.findMany({
      where: {
        id: { in: TEST_BUSINESSES.map(b => b.id) }
      },
      select: { id: true, name: true }
    });
    
    if (existingBusinesses.length > 0) {
      console.log('⚠️  Found existing test businesses:');
      existingBusinesses.forEach(b => console.log(`   - ${b.name} (${b.id})`));
      console.log('\n❌ Please remove existing test businesses before re-seeding.');
      console.log('   Run: npm run clean:test-data\n');
      process.exit(1);
    }
    
    // Seed all test businesses
    const createdBusinesses = [];
    for (const config of TEST_BUSINESSES) {
      const business = await seedTestBusiness(config);
      createdBusinesses.push(business);
    }
    
    console.log('\n✨ Test business seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   • ${createdBusinesses.length} businesses created`);
    console.log(`   • ${TEST_BUSINESSES.reduce((sum, b) => sum + b.customerCount, 0)} total customers`);
    console.log(`   • ${TEST_BUSINESSES.reduce((sum, b) => sum + b.reviewRequestCount, 0)} total review requests`);
    console.log(`   • ${TEST_BUSINESSES.reduce((sum, b) => sum + b.suppressionCount, 0)} total suppressions`);
    
    console.log('\n🔧 Business Switcher Test Scenarios:');
    console.log('   1. Fresh Start Cafe - Empty business (new account)');
    console.log('   2. Metropolitan Dental Practice - High-volume business');
    console.log('   3. Artisan Bakery & Cafe - Trial account (near limits)');
    console.log('   4. Vintage Motors - Suspended account');
    
    console.log('\n🎯 Ready for multi-tenant isolation testing!');
    console.log('   • Use BusinessSwitcher component to switch between accounts');
    console.log('   • Verify data isolation between businesses');
    console.log('   • Test different business states (active, suspended, trial)');
    console.log('   • Check audit logging for masquerade actions\n');
    
  } catch (error) {
    console.error('❌ Error seeding test businesses:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding
main().catch(console.error);