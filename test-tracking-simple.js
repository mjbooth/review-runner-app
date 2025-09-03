#!/usr/bin/env node

// Simple test to verify tracking URL accessibility
const { PrismaClient } = require('@prisma/client');

console.log('🔍 Testing tracking URL accessibility...');

async function testTrackingUrl() {
  const prisma = new PrismaClient();
  
  try {
    // Find ANY review request with a tracking UUID
    const reviewRequest = await prisma.reviewRequest.findFirst({
      where: {
        trackingUuid: {
          not: null
        }
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
          }
        },
        business: {
          select: {
            name: true,
          }
        }
      }
    });

    if (!reviewRequest) {
      console.log('❌ No review requests with tracking UUID found');
      console.log('Creating a test review request...');
      
      // Create a test review request with tracking UUID
      const testRequest = await prisma.reviewRequest.create({
        data: {
          businessId: '1', // Using business ID 1 for test
          customerId: '1',  // Using customer ID 1 for test
          status: 'SENT',
          channel: 'EMAIL',
          trackingUuid: 'test-' + Date.now(),
          message: 'Test message',
          sentAt: new Date(),
        },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
            }
          },
          business: {
            select: {
              name: true,
            }
          }
        }
      });
      
      console.log('✅ Created test review request');
      console.log(`   Tracking UUID: ${testRequest.trackingUuid}`);
      console.log(`   URL: http://localhost:3000/r/${testRequest.trackingUuid}`);
      
      return testRequest.trackingUuid;
    }

    console.log('✅ Found existing review request for testing:');
    console.log(`   Customer: ${reviewRequest.customer?.firstName || 'Unknown'} ${reviewRequest.customer?.lastName || ''}`);
    console.log(`   Business: ${reviewRequest.business?.name || 'Unknown'}`);
    console.log(`   Tracking UUID: ${reviewRequest.trackingUuid}`);
    console.log(`   URL: http://localhost:3000/r/${reviewRequest.trackingUuid}`);
    
    return reviewRequest.trackingUuid;
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

testTrackingUrl().then(uuid => {
  if (uuid) {
    console.log('');
    console.log('🧪 Now testing URL accessibility...');
    console.log(`📍 Visit: http://localhost:3000/r/${uuid}`);
    console.log('💡 This URL should NOT redirect to sign-in if middleware is fixed correctly.');
  }
});