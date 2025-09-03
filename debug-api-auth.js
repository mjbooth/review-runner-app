// Create a simple test to check what's happening with the API
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugAuth() {
  console.log('=== DEBUGGING API AUTHENTICATION ISSUE ===\n');
  
  // Check which users have businesses
  const users = await prisma.user.findMany({
    select: {
      clerkUserId: true,
      email: true
    }
  });
  
  const businesses = await prisma.business.findMany({
    select: {
      name: true,
      clerkUserId: true
    }
  });
  
  console.log('User-Business Mapping:');
  for (const user of users) {
    const business = businesses.find(b => b.clerkUserId === user.clerkUserId);
    console.log(`${user.email}: ${business ? business.name : 'NO BUSINESS'}`);
  }
  
  console.log('\n=== TESTING getBusinessContext LOGIC ===');
  
  // Test the exact logic from getBusinessContext
  for (const user of users) {
    console.log(`\nTesting user: ${user.email} (${user.clerkUserId})`);
    
    try {
      // This is the exact query from getBusinessContext
      const business = await prisma.business.findUnique({
        where: { clerkUserId: user.clerkUserId },
        select: { id: true, isActive: true, name: true },
      });
      
      if (!business) {
        console.log('❌ BUSINESS_NOT_FOUND: Business not found for user');
      } else if (!business.isActive) {
        console.log('❌ BUSINESS_INACTIVE: Business is not active');
      } else {
        console.log(`✅ SUCCESS: Would return businessId: ${business.id} (${business.name})`);
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
  }
  
  console.log('\n=== ISSUE DIAGNOSIS ===');
  console.log('If you are getting 500 errors, it means:');
  console.log('1. The API is redirecting to login (returning HTML)');
  console.log('2. This happens when Clerk auth fails');
  console.log('3. Or when getBusinessContext throws an error');
  console.log('\nMake sure you are logged in with one of these users:');
  users.forEach(u => console.log(`- ${u.email}`));
  
  await prisma.$disconnect();
}

debugAuth();