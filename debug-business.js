const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Debugging business lookup...\n');
    
    // Check all businesses
    const allBusinesses = await prisma.business.findMany({
      select: { 
        id: true, 
        name: true, 
        isActive: true, 
        createdAt: true,
        clerkUserId: true 
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`All businesses (${allBusinesses.length}):`);
    allBusinesses.forEach(b => {
      console.log(`  - ${b.name}`);
      console.log(`    ID: ${b.id}`);
      console.log(`    Active: ${b.isActive}`);
      console.log(`    ClerkUserId: ${b.clerkUserId}`);
      console.log(`    Created: ${b.createdAt}\n`);
    });
    
    // Check first active business (what auth context should find)
    const firstActive = await prisma.business.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('First active business (auth context should find):');
    if (firstActive) {
      console.log(`  ✅ Found: ${firstActive.name} (${firstActive.id})`);
    } else {
      console.log('  ❌ No active businesses found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();