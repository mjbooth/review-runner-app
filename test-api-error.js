// Test API endpoints to see actual errors
const testEndpoints = async () => {
  console.log('Testing API endpoints...\n');
  
  const endpoints = [
    '/api/customers',
    '/api/review-requests',
    '/api/businesses/current'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint}...`);
      const response = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log(`Status: ${response.status}`);
      const text = await response.text();
      
      // Try to parse as JSON
      try {
        const data = JSON.parse(text);
        console.log('Response:', JSON.stringify(data, null, 2));
      } catch {
        console.log('Response (text):', text.substring(0, 200));
      }
      console.log('---\n');
    } catch (error) {
      console.error(`Error testing ${endpoint}:`, error.message);
    }
  }
};

testEndpoints();