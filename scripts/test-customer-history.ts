import { prisma } from '../src/lib/prisma';

async function testCustomerHistory() {
  const customerId = '734939ee-1ab5-4cf5-b739-be485df35765';
  
  try {
    // Get customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    });
    
    console.log('Customer:', customer);
    
    if (!customer) {
      console.log('Customer not found');
      return;
    }
    
    // Get review requests
    const reviewRequests = await prisma.reviewRequest.findMany({
      where: {
        customerId: customerId,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    console.log('\n=== Review Requests ===');
    console.log('Total found:', reviewRequests.length);
    
    reviewRequests.forEach((req, idx) => {
      console.log(`\nRequest ${idx + 1}:`);
      console.log('  ID:', req.id);
      console.log('  Status:', req.status);
      console.log('  Channel:', req.channel);
      console.log('  Created:', req.createdAt);
      console.log('  Sent At:', req.sentAt);
      console.log('  Delivered At:', req.deliveredAt);
      console.log('  Clicked At:', req.clickedAt);
      console.log('  Business ID:', req.businessId);
    });
    
    // Get events
    const events = await prisma.event.findMany({
      where: {
        reviewRequest: {
          customerId: customerId,
        },
      },
      include: {
        reviewRequest: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    console.log('\n=== Events ===');
    console.log('Total found:', events.length);
    
    events.forEach((event, idx) => {
      console.log(`\nEvent ${idx + 1}:`);
      console.log('  Type:', event.type);
      console.log('  Created:', event.createdAt);
      console.log('  Request ID:', event.reviewRequestId);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCustomerHistory();