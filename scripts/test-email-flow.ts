import { config } from 'dotenv';

// Load environment variables first
config();

import { SendGridService } from '../src/services/messaging';
import { prisma } from '../src/lib/prisma';
import { logger } from '../src/lib/logger';

/**
 * Test script to verify end-to-end email review request flow
 * 
 * Usage: npm run test:email
 */

async function testEmailFlow() {
  console.log('🧪 Starting email flow test...');
  
  try {
    // 1. Create and initialize SendGrid service with fresh env vars
    console.log('\n1️⃣ Initializing SendGrid service...');
    const sendGridService = new SendGridService();
    const initResult = await sendGridService.initialize();
    if (!initResult.success) {
      console.error('❌ SendGrid initialization failed:', initResult.error);
      return;
    }
    console.log('✅ SendGrid initialized successfully');
    
    // 2. Check health status
    console.log('\n2️⃣ Checking SendGrid health...');
    const healthResult = await sendGridService.getHealthStatus();
    if (healthResult.success) {
      console.log('✅ SendGrid health:', healthResult.data);
    } else {
      console.log('❌ SendGrid health check failed:', healthResult.error);
      return;
    }
    
    // 3. Find a test business
    console.log('\n3️⃣ Finding test business...');
    const business = await prisma.business.findFirst({
      where: { isActive: true },
      select: { 
        id: true, 
        name: true,
        email: true,
        googleReviewUrl: true 
      },
    });
    
    if (!business) {
      console.error('❌ No active business found');
      return;
    }
    console.log('✅ Using business:', business.name);
    
    // 4. Find or create a test customer
    console.log('\n4️⃣ Finding test customer...');
    let customer = await prisma.customer.findFirst({
      where: {
        businessId: business.id,
        email: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });
    
    if (!customer) {
      console.log('📝 Creating test customer...');
      customer = await prisma.customer.create({
        data: {
          businessId: business.id,
          firstName: 'Test',
          lastName: 'Customer',
          email: 'test@example.com', // Change this to a real email for testing
        },
      });
    }
    console.log('✅ Using customer:', `${customer.firstName} ${customer.lastName} (${customer.email})`);
    
    // 5. Create a review request
    console.log('\n5️⃣ Creating review request...');
    const reviewRequest = await prisma.reviewRequest.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        channel: 'EMAIL',
        subject: 'Test: Share your experience with us',
        messageContent: `Hi {{firstName}},

This is a test email from Review Runner. We'd love to hear about your experience with {{businessName}}!

Please click here to leave a review: {{trackingUrl}}

Thank you!

Best regards,
The {{businessName}} Team

Don't want to receive these emails? {{unsubscribeUrl}}`,
        reviewUrl: business.googleReviewUrl || 'https://example.com/review',
        trackingUrl: `http://localhost:3000/r/${crypto.randomUUID()}`,
        trackingUuid: crypto.randomUUID(),
        status: 'QUEUED',
      },
      select: {
        id: true,
        channel: true,
        status: true,
        subject: true,
        messageContent: true,
      },
    });
    console.log('✅ Review request created:', reviewRequest.id);
    
    // 6. Send the email
    console.log('\n6️⃣ Sending test email...');
    const emailResult = await sendGridService.sendReviewRequestEmail(
      customer.email!,
      `${customer.firstName} ${customer.lastName}`,
      {
        content: reviewRequest.messageContent,
        subject: reviewRequest.subject || 'Share your experience',
        trackingUrl: `http://localhost:3000/r/${reviewRequest.id}`,
        unsubscribeUrl: `http://localhost:3000/unsubscribe/${reviewRequest.id}`,
      },
      business.id,
      reviewRequest.id
    );
    
    if (emailResult.success) {
      console.log('✅ Email sent successfully!');
      console.log('   Message ID:', emailResult.messageId);
      console.log('   Delivery time:', emailResult.deliveryTime, 'ms');
      console.log('   Retry count:', emailResult.retryCount);
      
      // Update review request status
      await prisma.reviewRequest.update({
        where: { id: reviewRequest.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          externalId: emailResult.messageId,
        },
      });
    } else {
      console.error('❌ Email sending failed:', emailResult.error);
      console.error('   Status code:', emailResult.statusCode);
    }
    
    // 7. Check review request events
    console.log('\n7️⃣ Checking events...');
    const events = await prisma.event.findMany({
      where: { reviewRequestId: reviewRequest.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    console.log('📋 Recent events:');
    for (const event of events) {
      console.log(`   - ${event.type}: ${event.description}`);
    }
    
    console.log('\n✨ Email flow test completed!');
    console.log('\n📌 Next steps:');
    console.log('   1. Check your email inbox for the test message');
    console.log('   2. Configure SendGrid webhook URL to receive delivery events');
    console.log('   3. Monitor the events table for webhook updates');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testEmailFlow()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
