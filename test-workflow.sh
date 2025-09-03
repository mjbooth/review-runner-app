#!/bin/bash

# Review Runner - Complete Workflow Testing Script
# This script tests the entire review request workflow

set -e

API_BASE="http://localhost:3001"
FRONTEND_BASE="http://localhost:3000"

echo "🚀 Starting Review Runner Workflow Test"
echo "========================================="

# Check if services are running
echo "📡 Checking service health..."

# Test API health
if curl -s "$API_BASE/health" > /dev/null; then
    echo "✅ API server is running"
else
    echo "❌ API server is not running. Start with: npm run dev:api"
    exit 1
fi

# Test Redis/Queue health
echo "🔄 Checking job queue health..."
QUEUE_HEALTH=$(curl -s "$API_BASE/api/test/health" | jq -r '.success')
if [ "$QUEUE_HEALTH" = "true" ]; then
    echo "✅ Job queue system is healthy"
else
    echo "⚠️  Job queue may have issues. Check Redis connection."
fi

echo ""
echo "🧪 Testing Individual Components"
echo "================================"

# Test SMS (if Twilio configured)
echo "📱 Testing SMS integration..."
SMS_TEST=$(curl -s -X POST "$API_BASE/api/test/sms" \
  -H "Content-Type: application/json" \
  -d '{"to": "+447123456789", "message": "Test SMS from Review Runner"}' | jq -r '.success')

if [ "$SMS_TEST" = "true" ]; then
    echo "✅ SMS integration working"
else
    echo "⚠️  SMS integration needs configuration (check Twilio settings)"
fi

# Test Email (if SendGrid configured)
echo "📧 Testing email integration..."
EMAIL_TEST=$(curl -s -X POST "$API_BASE/api/test/email" \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com", "subject": "Test Email"}' | jq -r '.success')

if [ "$EMAIL_TEST" = "true" ]; then
    echo "✅ Email integration working"
else
    echo "⚠️  Email integration needs configuration (check SendGrid settings)"
fi

# Test message rendering
echo "📝 Testing message rendering..."
RENDER_TEST=$(curl -s -X POST "$API_BASE/api/test/render" \
  -H "Content-Type: application/json" \
  -d '{"channel": "SMS", "customerName": "John Doe", "businessName": "Test Business"}' | jq -r '.success')

if [ "$RENDER_TEST" = "true" ]; then
    echo "✅ Message rendering working"
else
    echo "❌ Message rendering failed"
fi

echo ""
echo "🏗️  Creating Test Data"
echo "======================"

# Create test data
echo "Creating test business and customers..."
TEST_DATA=$(curl -s -X POST "$API_BASE/api/test/create-test-data" | jq -r '.success')

if [ "$TEST_DATA" = "true" ]; then
    echo "✅ Test data created successfully"
    echo "📝 Note: You'll need to update the Clerk user ID in the test data endpoint"
else
    echo "⚠️  Could not create test data automatically"
    echo "💡 Manual setup required:"
    echo "   1. Sign up at $FRONTEND_BASE"
    echo "   2. Note your Clerk user ID"
    echo "   3. Create business and customer records manually"
fi

echo ""
echo "🔗 Test URLs and Next Steps"
echo "============================"
echo "Frontend: $FRONTEND_BASE"
echo "API Docs: $API_BASE/health"
echo "Queue Health: $API_BASE/api/test/health"
echo "Prisma Studio: Run 'npx prisma studio'"
echo ""
echo "📋 Manual Testing Checklist:"
echo "1. ✅ Sign up at $FRONTEND_BASE"
echo "2. ✅ Create customers via API or dashboard"
echo "3. ✅ Create review request via API:"
echo "   curl -X POST $API_BASE/api/review-requests \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'Authorization: Bearer YOUR_CLERK_JWT' \\"
echo "     -d '{\"customerId\": \"...\", \"channel\": \"SMS\", ...}'"
echo "4. ✅ Check job worker logs for processing"
echo "5. ✅ Test click tracking URL from response"
echo "6. ✅ Test unsubscribe URL"
echo "7. ✅ Check webhook endpoints with ngrok"
echo ""
echo "🔧 Development Tools:"
echo "• Job Queue UI: Consider adding Bull Board"
echo "• API Testing: Use Postman or Insomnia"
echo "• Database: Prisma Studio"
echo "• Logs: Check terminal outputs"
echo ""
echo "✨ Testing complete! Check the logs above for any issues."