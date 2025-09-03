# Email Review Request Setup Guide

## Overview

The email review request system is now fully implemented and ready to use. This guide will help you configure and test the email functionality.

## Prerequisites

### 1. SendGrid Account

You'll need a SendGrid account with:
- API key with "Mail Send" permissions
- Verified sender email address
- (Optional) Webhook configuration for delivery tracking

### 2. Redis Instance

For job queue processing, you need either:
- **Docker Redis (Recommended)**: See [Redis Docker Setup](./REDIS_DOCKER_SETUP.md)
- Local Redis installation
- Cloud Redis service (e.g., Upstash Redis)

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# SendGrid Configuration
SENDGRID_API_KEY="SG.your_actual_api_key_here"
SENDGRID_FROM_EMAIL="noreply@yourdomain.com"  # Must be verified in SendGrid
SENDGRID_FROM_NAME="Your Business Name"

# Redis Configuration (for job queue)
REDIS_URL="redis://localhost:6379"  # Or your cloud Redis URL
```

### SendGrid Setup Steps

1. **Create API Key**:
   - Log into SendGrid Dashboard
   - Go to Settings > API Keys
   - Create a new API Key with "Full Access" or custom "Mail Send" permission
   - Copy the key (it's only shown once!)

2. **Verify Sender**:
   - Go to Settings > Sender Authentication
   - Add and verify your sender email address
   - Complete domain authentication for better deliverability

3. **Configure Webhooks** (Optional but recommended):
   - Go to Settings > Mail Settings > Event Webhooks
   - Add webhook URL: `https://yourdomain.com/api/webhooks/sendgrid`
   - Select events to track:
     - Delivered
     - Opened
     - Clicked
     - Bounced
     - Dropped
     - Spam Reports
     - Unsubscribe

## Testing the Email Flow

### 1. Start Redis with Docker

```bash
# Start Redis container
npm run redis:start
```

### 2. Install Dependencies

```bash
npm install --legacy-peer-deps
```

### 3. Run the Test Script

```bash
npm run test:email
```

This will:
- Initialize SendGrid service
- Create a test customer and review request
- Send a test email
- Show delivery status

### 3. Test via API

Create a review request via the API:

```bash
curl -X POST http://localhost:3000/api/review-requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CLERK_JWT" \
  -d '{
    "customerId": "customer-uuid",
    "channel": "EMAIL",
    "subject": "We'd love your feedback!",
    "messageContent": "Hi {{firstName}}, thanks for visiting {{businessName}}. Please share your experience: {{trackingUrl}}",
    "reviewUrl": "https://g.page/your-business/review"
  }'
```

## How It Works

### Immediate Email Flow

1. Review request created via API
2. Email sent immediately via SendGrid
3. Status updated to "SENT"
4. SendGrid webhooks update delivery status

### Scheduled Email Flow

1. Review request created with `scheduledFor` date
2. Job added to BullMQ queue with delay
3. Worker processes job at scheduled time
4. Email sent via SendGrid
5. Status tracking via webhooks

### Email Templates

The system supports template variables:
- `{{firstName}}` - Customer's first name
- `{{lastName}}` - Customer's last name
- `{{businessName}}` - Business name
- `{{trackingUrl}}` - Tracked review link
- `{{reviewUrl}}` - Direct review URL
- `{{unsubscribeUrl}}` - Unsubscribe link

## Architecture Components

### 1. SendGrid Service (`src/services/messaging.ts`)
- Email sending with retry logic
- Rate limiting (200 emails/hour per business)
- Content validation and sanitization
- Comprehensive error handling

### 2. Job Queue Processor (`src/jobs/send-request.ts`)
- Processes scheduled emails
- Handles retries for failed sends
- Checks suppressions before sending
- Updates credit usage

### 3. API Integration (`src/app/api/review-requests/route.ts`)
- Immediate sending for non-scheduled emails
- Queue integration for scheduled emails
- Support for single, bulk, and campaign requests

### 4. Webhook Handler (`src/app/api/webhooks/sendgrid/route.ts`)
- Processes SendGrid events
- Updates review request status
- Manages suppression list automatically

## Monitoring & Debugging

### Check Email Status

```sql
-- View recent email requests
SELECT 
  rr.id,
  rr.status,
  rr.sent_at,
  rr.delivered_at,
  rr.clicked_at,
  c.email,
  c.first_name
FROM review_requests rr
JOIN customers c ON c.id = rr.customer_id
WHERE rr.channel = 'EMAIL'
ORDER BY rr.created_at DESC
LIMIT 10;

-- Check email events
SELECT 
  type,
  description,
  created_at,
  metadata
FROM events
WHERE review_request_id = 'your-request-id'
ORDER BY created_at DESC;
```

### Common Issues

1. **"SendGrid API key not configured"**
   - Ensure `SENDGRID_API_KEY` is set in `.env`
   - Restart the development server

2. **"Invalid sender email"**
   - Verify `SENDGRID_FROM_EMAIL` is verified in SendGrid
   - Complete sender authentication

3. **Emails not sending**
   - Check Redis connection for job queue
   - Verify worker processes are running
   - Check SendGrid API quota

4. **Webhooks not updating status**
   - Verify webhook URL is publicly accessible
   - Check webhook configuration in SendGrid
   - Review webhook logs in `/api/webhooks/sendgrid`

## Production Checklist

- [ ] SendGrid API key configured
- [ ] Sender email verified and authenticated
- [ ] Domain authentication completed
- [ ] Webhook URL configured and accessible
- [ ] Redis configured for job queue
- [ ] Worker processes running
- [ ] Rate limits configured appropriately
- [ ] Monitoring/alerting set up
- [ ] Suppression list management tested
- [ ] Email templates reviewed and tested

## Support

For issues or questions:
1. Check the logs: `npm run dev` shows detailed logging
2. Review webhook events in the database
3. Test with the provided test script
4. Verify SendGrid dashboard for delivery status
