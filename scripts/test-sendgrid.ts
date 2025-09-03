import sgMail from '@sendgrid/mail';
import { config } from 'dotenv';

// Load environment variables
config();

async function testSendGrid() {
  console.log('🧪 Testing SendGrid API connection...');
  
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.error('❌ SENDGRID_API_KEY not found in environment');
    return;
  }
  
  console.log(`🔑 Using API key: ${apiKey.substring(0, 7)}...${apiKey.slice(-3)}`);
  
  try {
    // Set the API key
    sgMail.setApiKey(apiKey);
    console.log('✅ SendGrid API key set successfully');
    
    // Try to validate by sending a test (we won't actually send, just validate)
    const testEmail = {
      to: 'test@example.com', // Won't be sent
      from: process.env.SENDGRID_FROM_EMAIL!,
      subject: 'Test email',
      text: 'This is a test email',
      mail_settings: {
        sandbox_mode: {
          enable: true // This prevents actual sending
        }
      }
    };
    
    console.log('📧 Testing email validation...');
    const [response] = await sgMail.send(testEmail);
    
    console.log('✅ SendGrid API validation successful!');
    console.log(`   Status Code: ${response.statusCode}`);
    console.log(`   Message ID: ${response.headers['x-message-id']}`);
    
  } catch (error: any) {
    console.error('❌ SendGrid API test failed:');
    
    if (error.response) {
      console.error(`   Status Code: ${error.response.statusCode}`);
      console.error(`   Error Body:`, JSON.stringify(error.response.body, null, 2));
      
      // Common error codes
      switch (error.response.statusCode) {
        case 401:
          console.error('   🚨 Authentication failed - check your API key');
          break;
        case 403:
          console.error('   🚨 Forbidden - API key may not have mail send permissions');
          break;
        case 400:
          console.error('   🚨 Bad request - check your email format');
          break;
        default:
          console.error(`   🚨 Unexpected error code: ${error.response.statusCode}`);
      }
    } else {
      console.error(`   Error: ${error.message}`);
    }
  }
}

testSendGrid()
  .then(() => {
    console.log('\n🎉 SendGrid test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed with error:', error);
    process.exit(1);
  });
