import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Load environment variables
const envPath = resolve(process.cwd(), '.env');
const envLocalPath = resolve(process.cwd(), '.env.local');

console.log('🔍 Checking environment configuration...');
console.log('\n📁 Environment files:');
console.log(`  .env: ${existsSync(envPath) ? '✅ Found' : '❌ Not found'} at ${envPath}`);
console.log(`  .env.local: ${existsSync(envLocalPath) ? '✅ Found' : '❌ Not found'} at ${envLocalPath}`);

// Load .env file
const result = config({ path: envPath });
if (result.error) {
  console.error('\n❌ Error loading .env:', result.error.message);
} else {
  console.log('\n✅ Successfully loaded .env file');
}

// Check SendGrid variables
console.log('\n📧 SendGrid Configuration:');
const sendgridVars = {
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
  SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME,
};

for (const [key, value] of Object.entries(sendgridVars)) {
  if (!value) {
    console.log(`  ${key}: ❌ Not set`);
  } else {
    // Mask sensitive data
    if (key === 'SENDGRID_API_KEY') {
      const masked = value.substring(0, 7) + '*'.repeat(Math.max(0, value.length - 10)) + value.slice(-3);
      console.log(`  ${key}: ✅ Set (${masked})`);
      
      // Check API key format
      if (!value.startsWith('SG.')) {
        console.log(`    ⚠️  Warning: SendGrid API keys usually start with 'SG.'`);
      }
      if (value.includes(' ')) {
        console.log(`    ⚠️  Warning: API key contains spaces`);
      }
      if (value.includes('"') || value.includes("'")) {
        console.log(`    ⚠️  Warning: API key contains quotes - remove them`);
      }
    } else {
      console.log(`  ${key}: ✅ Set (${value})`);
    }
  }
}

// Check Redis configuration
console.log('\n🔴 Redis Configuration:');
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.log(`  REDIS_URL: ❌ Not set (will default to redis://localhost:6379)`);
} else {
  console.log(`  REDIS_URL: ✅ Set (${redisUrl})`);
}

// Check other important variables
console.log('\n🔧 Other Configuration:');
const otherVars = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'not set',
};

for (const [key, value] of Object.entries(otherVars)) {
  console.log(`  ${key}: ${value}`);
}

// Test Redis connection
console.log('\n🧪 Testing Redis connection...');

async function testRedis() {
  console.log('  ℹ️  Redis test skipped - run `redis-cli ping` to test manually');
}

// Common issues to check
console.log('\n⚠️  Common Issues to Check:');
console.log('  1. Remove any quotes around values in .env file');
console.log('  2. Ensure no spaces before or after = sign');
console.log('  3. SendGrid API key should start with SG.');
console.log('  4. Verify sender email is authenticated in SendGrid');
console.log('  5. Check for typos in variable names');

console.log('\n📝 Example .env format:');
console.log('SENDGRID_API_KEY=SG.actualKeyWithoutQuotes');
console.log('SENDGRID_FROM_EMAIL=noreply@yourdomain.com');
console.log('SENDGRID_FROM_NAME=Your Business Name');

testRedis().then(() => {
  process.exit(0);
});
