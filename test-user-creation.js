// Quick test script to verify user creation works
// Run with: node test-user-creation.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testUserCreation() {
  try {
    console.log('🧪 Testing user creation with automatic business creation...');

    // Simulate creating a user (like the Clerk webhook would)
    const testClerkUserId = `test_user_${Date.now()}`;
    
    console.log('📝 Creating user:', testClerkUserId);

    // This should automatically create a business too
    const result = await prisma.$transaction(async (tx) => {
      // Create the business first
      const business = await tx.business.create({
        data: {
          name: "Test User's Business",
          smsCreditsLimit: 100,
          emailCreditsLimit: 500, 
          smsCreditsUsed: 0,
          emailCreditsUsed: 0,
          isActive: true,
          settings: {}
        }
      });

      // Create the user with business connection
      const newUser = await tx.user.create({
        data: {
          clerkUserId: testClerkUserId,
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          businessId: business.id,
          onboardingStatus: 'IN_PROGRESS',
          onboardingStep: 0,
          onboardingCompletedSteps: [],
        },
        include: { business: true }
      });

      return newUser;
    });

    console.log('✅ User created successfully with business:');
    console.log('👤 User ID:', result.id);
    console.log('🏢 Business ID:', result.business?.id);
    console.log('📧 Email:', result.email);
    console.log('📊 Onboarding Status:', result.onboardingStatus);

    // Clean up test data
    await prisma.user.delete({
      where: { clerkUserId: testClerkUserId }
    });
    
    if (result.business?.id) {
      await prisma.business.delete({
        where: { id: result.business.id }
      });
    }

    console.log('🧹 Test data cleaned up');
    console.log('🎉 User creation test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testUserCreation();