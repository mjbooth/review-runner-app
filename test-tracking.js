#!/usr/bin/env node

// Simple test script for tracking URL functionality
const { PrismaClient } = require('@prisma/client');

console.log('🔍 Testing tracking URL functionality...');

async function testTrackingFlow() {
  const prisma = new PrismaClient();
  
  try {
    // Find any review request 
    const reviewRequest = await prisma.reviewRequest.findFirst({
      where: {},
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        business: {
          select: {
            name: true,
            googleReviewUrl: true,
            website: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!reviewRequest) {
      console.log('❌ No review requests found');
      console.log('💡 Try creating a review request first in the dashboard');
      return;
    }
    
    if (!reviewRequest.trackingUuid) {
      console.log('❌ Review request found but no tracking UUID');
      console.log('💡 This may be an older request - tracking UUIDs are added to new requests');
      return;
    }

    console.log('✅ Found review request for testing:');
    console.log(`   ID: ${reviewRequest.id}`);
    console.log(`   Customer: ${reviewRequest.customer.firstName} ${reviewRequest.customer.lastName}`);
    console.log(`   Business: ${reviewRequest.business.name}`);
    console.log(`   Status: ${reviewRequest.status}`);
    console.log(`   Tracking UUID: ${reviewRequest.trackingUuid}`);
    console.log(`   Tracking URL: http://localhost:3000/r/${reviewRequest.trackingUuid}`);
    console.log('');
    
    console.log('🧪 Testing tracking URL endpoint...');
    
    // Test the tracking URL endpoint
    const response = await fetch(`http://localhost:3000/r/${reviewRequest.trackingUuid}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Test Bot) Chrome/120.0.0.0',
        'X-Forwarded-For': '127.0.0.1',
      },
      redirect: 'manual', // Don't follow redirects automatically
    });

    console.log(`📊 Response status: ${response.status}`);
    console.log(`📊 Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (response.status === 200) {
      const htmlContent = await response.text();
      console.log('✅ Tracking URL working - got HTML redirect page');
      
      // Check if HTML contains expected elements
      if (htmlContent.includes(reviewRequest.customer.firstName)) {
        console.log('✅ Personalization working - customer name found in HTML');
      } else {
        console.log('⚠️ Personalization issue - customer name not found in HTML');
      }
      
      if (htmlContent.includes(reviewRequest.business.name)) {
        console.log('✅ Business name found in redirect page');
      } else {
        console.log('⚠️ Business name not found in redirect page');
      }
      
    } else if (response.status === 404) {
      console.log('❌ Tracking URL returned 404 - link not found or expired');
    } else {
      console.log('❌ Unexpected response from tracking URL');
    }

    // Check if click was tracked in database
    console.log('');
    console.log('🔍 Checking if click was tracked in database...');
    
    const updatedRequest = await prisma.reviewRequest.findUnique({
      where: { id: reviewRequest.id },
      select: {
        clickedAt: true,
        status: true,
        clickMetadata: true,
      },
    });

    if (updatedRequest?.clickedAt) {
      console.log('✅ Click tracked in database successfully');
      console.log(`   Clicked at: ${updatedRequest.clickedAt}`);
      console.log(`   Status: ${updatedRequest.status}`);
      if (updatedRequest.clickMetadata) {
        console.log(`   Metadata:`, updatedRequest.clickMetadata);
      }
    } else {
      console.log('⚠️ Click not yet tracked in database');
    }

    // Check for events
    const clickEvents = await prisma.event.findMany({
      where: {
        reviewRequestId: reviewRequest.id,
        type: 'REQUEST_CLICKED',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (clickEvents.length > 0) {
      console.log('✅ Click event created successfully');
      console.log(`   Event ID: ${clickEvents[0].id}`);
      console.log(`   Created at: ${clickEvents[0].createdAt}`);
    } else {
      console.log('⚠️ No click events found');
    }

    console.log('');
    console.log('🎉 Tracking URL test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testTrackingFlow();