#!/usr/bin/env tsx

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

interface TestUser {
  clerkUserId: string;
  email: string;
  name: string;
  googleMapsUrl?: string;
}

const TEST_USERS: TestUser[] = [
  {
    clerkUserId: 'test_user_1',
    email: 'bakery@test.com',
    name: 'Sweet Dreams Bakery',
    googleMapsUrl: 'https://maps.app.goo.gl/cGdbAmiUuP3y8ur37',
  },
  {
    clerkUserId: 'test_user_2',
    email: 'restaurant@test.com',
    name: 'The Golden Fork Restaurant',
    googleMapsUrl: 'https://maps.google.com/maps?place_id=ChIJrTLr-GyuEmsRBfy61i59si0',
  },
  {
    clerkUserId: 'test_user_3',
    email: 'salon@test.com',
    name: 'Glamour Hair Salon',
    googleMapsUrl: 'https://goo.gl/maps/xyz123hairsalon',
  },
  {
    clerkUserId: 'test_user_4',
    email: 'plumber@test.com',
    name: 'QuickFix Plumbing Services',
    googleMapsUrl: 'https://maps.google.com/maps/place/QuickFix+Plumbing/@-33.8688,151.2093,17z',
  },
  {
    clerkUserId: 'test_user_5',
    email: 'dentist@test.com',
    name: 'Bright Smile Dental',
    googleMapsUrl: 'https://maps.app.goo.gl/dental123456789',
  },
  {
    clerkUserId: 'test_user_6',
    email: 'cafe@test.com',
    name: 'Corner Coffee House',
    googleMapsUrl: 'https://maps.google.com/maps?cid=12345678901234567890',
  },
  {
    clerkUserId: 'test_user_7',
    email: 'fitness@test.com',
    name: 'PowerHouse Gym',
  },
  {
    clerkUserId: 'test_user_8',
    email: 'florist@test.com',
    name: 'Bloom & Blossom Florists',
    googleMapsUrl: 'https://maps.google.com/maps/place/Bloom+Blossom+Florists/@51.5074,-0.1278,15z',
  },
  {
    clerkUserId: 'test_user_9',
    email: 'auto@test.com',
    name: 'Speedy Auto Repairs',
    googleMapsUrl: 'https://maps.app.goo.gl/speedyauto987654321',
  },
  {
    clerkUserId: 'test_user_10',
    email: 'petshop@test.com',
    name: 'Furry Friends Pet Store',
  },
];

async function resetTestData() {
  try {
    logger.info('🗑️  Clearing existing test data...');

    // Delete in order to avoid foreign key constraints
    await prisma.event.deleteMany({
      where: {
        business: {
          clerkUserId: {
            startsWith: 'test_user_',
          },
        },
      },
    });

    await prisma.reviewRequest.deleteMany({
      where: {
        business: {
          clerkUserId: {
            startsWith: 'test_user_',
          },
        },
      },
    });

    await prisma.customer.deleteMany({
      where: {
        business: {
          clerkUserId: {
            startsWith: 'test_user_',
          },
        },
      },
    });

    await prisma.suppression.deleteMany({
      where: {
        business: {
          clerkUserId: {
            startsWith: 'test_user_',
          },
        },
      },
    });

    await prisma.business.deleteMany({
      where: {
        clerkUserId: {
          startsWith: 'test_user_',
        },
      },
    });

    logger.info('✅ Test data cleared successfully');

    // Optionally create some base test businesses
    logger.info('🌱 Creating fresh test businesses...');

    for (const testUser of TEST_USERS) {
      await prisma.business.create({
        data: {
          clerkUserId: testUser.clerkUserId,
          name: testUser.name,
          email: testUser.email,
          timezone: 'Europe/London',
          isActive: true,
        },
      });

      logger.info(`✅ Created test business: ${testUser.name}`);
    }

    logger.info('🎉 Test data reset complete!');

    console.log('\n📋 Test Users Created:');
    TEST_USERS.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   Clerk User ID: ${user.clerkUserId}`);
      if (user.googleMapsUrl) {
        console.log(`   Test URL: ${user.googleMapsUrl}`);
      }
      console.log('');
    });

    console.log('\n🧪 Testing Guide:');
    console.log('1. Use different test user IDs in Clerk dashboard for testing');
    console.log('2. Each user represents a different business type and onboarding scenario');
    console.log('3. Some users have Google Maps URLs for testing connection flow');
    console.log('4. Use "npm run reset-test-data" to clear and recreate test data');
    console.log('5. Use "npm run test-onboarding" to simulate full flows');
  } catch (error) {
    logger.error('❌ Error resetting test data', { error });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  resetTestData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { resetTestData, TEST_USERS };
