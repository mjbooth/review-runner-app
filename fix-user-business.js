const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixUserBusinessAssociation() {
  try {
    console.log('=== FIXING USER-BUSINESS ASSOCIATIONS ===\n');
    
    // Get all users
    const users = await prisma.user.findMany({
      include: {
        business: true
      }
    });
    
    console.log('Current Users:');
    users.forEach(user => {
      console.log(`- ${user.clerkUserId}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Business: ${user.business?.name || 'NONE'}`);
      console.log('');
    });
    
    // Get all businesses
    const businesses = await prisma.business.findMany({
      select: {
        id: true,
        name: true,
        clerkUserId: true
      }
    });
    
    console.log('Current Businesses:');
    businesses.forEach(b => {
      console.log(`- ${b.name}`);
      console.log(`  Owner (clerkUserId): ${b.clerkUserId}`);
      console.log(`  Business ID: ${b.id}`);
      console.log('');
    });
    
    // The issue: We have users in the users table, but businesses use clerkUserId directly
    // The logged-in user likely doesn't match any business.clerkUserId
    
    console.log('=== ANALYSIS ===');
    console.log('The problem: Users table and Businesses table both reference Clerk users');
    console.log('but they are not properly linked.\n');
    
    // Find users without matching businesses
    for (const user of users) {
      const matchingBusiness = businesses.find(b => b.clerkUserId === user.clerkUserId);
      
      if (!matchingBusiness) {
        console.log(`❌ User ${user.clerkUserId} (${user.email}) has NO matching business`);
        console.log('   This user will get 500 errors when accessing the API\n');
        
        // Suggest a fix
        if (businesses.length > 0) {
          console.log('   Possible fixes:');
          console.log(`   1. Create a new business for this user`);
          console.log(`   2. Update an existing business to use this clerkUserId`);
          
          // Check if this might be a test user that should own Mister Yik's
          if (user.email === 'jebige7351@lespedia.com') {
            const mistersYiks = businesses.find(b => b.name === "Mister Yik's");
            if (mistersYiks) {
              console.log(`\n   RECOMMENDED: Update Mister Yik's to be owned by ${user.clerkUserId}`);
              console.log(`   Run: UPDATE businesses SET clerk_user_id = '${user.clerkUserId}' WHERE id = '${mistersYiks.id}'`);
            }
          }
        }
      } else {
        console.log(`✅ User ${user.clerkUserId} owns business: ${matchingBusiness.name}`);
      }
    }
    
    // The real issue is that new users created through webhook don't get businesses
    console.log('\n=== ROOT CAUSE ===');
    console.log('When users sign up:');
    console.log('1. Clerk creates the user');
    console.log('2. Webhook creates user in users table');
    console.log('3. BUT no business is created');
    console.log('4. getBusinessContext() fails because no business exists');
    console.log('5. API returns 500 error\n');
    
    console.log('SOLUTION: Users need to complete onboarding to create their business');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixUserBusinessAssociation();