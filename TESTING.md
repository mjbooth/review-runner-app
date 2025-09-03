# Testing Guide - Review Runner

This guide provides comprehensive instructions for testing the onboarding flow and other features of Review Runner.

## Quick Start Testing

### 1. Setup Demo Environment

```bash
npm run setup:demo
```

This will:

- Reset and create fresh test businesses
- Seed realistic test customers for each business type
- Provide ready-to-test scenarios

### 2. Test Onboarding Flow

```bash
npm run test-onboarding
```

This will:

- Test Google Places integration with various URL formats
- Test business name search fallback
- Simulate different onboarding scenarios
- Generate a comprehensive test report

### 3. Full Testing Suite

```bash
npm run test:full-onboarding
```

This combines both setup and testing for a complete validation.

## Available Test Scripts

| Script                 | Purpose                            | Description                                                |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `reset-test-data`      | Clear and recreate test businesses | Removes all test data and creates 10 fresh test businesses |
| `seed-test-customers`  | Add realistic customers            | Creates 4 customers per business based on business type    |
| `test-onboarding`      | Test Google Places integration     | Validates URL parsing, place extraction, and search        |
| `setup:demo`           | Complete demo setup                | Combines reset + seed for full demo environment            |
| `test:full-onboarding` | Full onboarding validation         | Complete testing workflow                                  |

## Test User Scenarios

### Business Types & Test Cases

1. **Sweet Dreams Bakery** (`test_user_1`)
   - Google Maps: Short URL (maps.app.goo.gl)
   - Tests: Shortened URL resolution and place extraction

2. **The Golden Fork Restaurant** (`test_user_2`)
   - Google Maps: Direct place_id URL
   - Tests: Standard place_id extraction

3. **Glamour Hair Salon** (`test_user_3`)
   - Google Maps: Shortened goo.gl URL
   - Tests: Legacy shortened URL handling

4. **QuickFix Plumbing Services** (`test_user_4`)
   - Google Maps: Browser URL with coordinates
   - Tests: Coordinate-based URL parsing

5. **Bright Smile Dental** (`test_user_5`)
   - Google Maps: App share link
   - Tests: Modern share link format

6. **Corner Coffee House** (`test_user_6`)
   - Google Maps: CID (Customer ID) format
   - Tests: CID handling and fallback search

7. **PowerHouse Gym** (`test_user_7`)
   - Google Maps: None (skip scenario)
   - Tests: Skip Google connection flow

8. **Bloom & Blossom Florists** (`test_user_8`)
   - Google Maps: Standard place URL
   - Tests: Place name extraction and search

9. **Speedy Auto Repairs** (`test_user_9`)
   - Google Maps: App short link
   - Tests: App-generated shortened URLs

10. **Furry Friends Pet Store** (`test_user_10`)
    - Google Maps: None (skip scenario)
    - Tests: Manual business entry flow

## Testing Workflows

### Manual Onboarding Testing

1. **Start Development Environment**

   ```bash
   npm run dev
   ```

2. **Access Onboarding Page**
   - Navigate to `/onboarding`
   - Use test user credentials from Clerk dashboard

3. **Test Different Scenarios**
   - **Happy Path**: Use test_user_1 with provided Google Maps URL
   - **URL Parsing**: Try different URL formats from test users
   - **Skip Flow**: Use test_user_7 or test_user_10 (no Google URLs)
   - **Error Handling**: Use invalid URLs or non-Google links

### Automated Testing

1. **Google Places API Testing**

   ```bash
   npm run test-onboarding
   ```

   This will automatically:
   - Test URL parsing for all formats
   - Validate Google Places API responses
   - Test business name search fallback
   - Generate success/failure metrics

2. **Database State Testing**

   ```bash
   npm run reset-test-data
   npm run db:studio
   ```

   Use Prisma Studio to verify:
   - Test businesses are created correctly
   - Business data matches expected values
   - No duplicate entries exist

## Customer Data for Testing

Each business type has realistic customer data:

- **Bakery**: Wedding cakes, regular customers, corporate catering
- **Restaurant**: Reservations, group bookings, dietary requirements
- **Salon**: Color treatments, bridal services, regular clients
- **Plumbing**: Emergency calls, installations, maintenance
- **Dental**: Checkups, treatments, consultations
- **Cafe**: Subscriptions, meetings, catering
- **Fitness**: Personal training, group classes, memberships
- **Florist**: Weddings, funerals, corporate deliveries
- **Auto Repair**: MOTs, repairs, diagnostics
- **Pet Shop**: Supplies, grooming, veterinary referrals

## Common Testing Patterns

### 1. Testing Google Maps URL Formats

```typescript
const testUrls = [
  'https://maps.app.goo.gl/abc123', // App short link
  'https://goo.gl/maps/xyz789', // Legacy short link
  'https://maps.google.com/?place_id=ChIJ...', // Direct place_id
  'https://maps.google.com/maps/place/Name/@lat,lng', // Browser URL
  'https://maps.google.com/?cid=12345', // CID format
];
```

### 2. Testing Error Scenarios

```typescript
const invalidUrls = [
  'https://example.com/not-google', // Non-Google URL
  'https://maps.google.com/invalid', // Invalid Google URL
  'not-a-url-at-all', // Invalid URL format
  '', // Empty string
];
```

### 3. Testing Skip Flows

- Test onboarding completion without Google connection
- Verify business creation with minimal data
- Test manual customer addition after skipping Google setup

## Verification Checklist

After testing, verify:

- [ ] All test businesses created successfully
- [ ] Google Places integration works for valid URLs
- [ ] Error handling graceful for invalid URLs
- [ ] Skip flow allows onboarding completion
- [ ] Customer data seeded correctly
- [ ] No authentication errors in logs
- [ ] Database state consistent
- [ ] UI shows appropriate feedback messages

## Troubleshooting

### Common Issues

1. **Google Places API Errors**
   - Check `GOOGLE_PLACES_API_KEY` environment variable
   - Verify API key has Places API enabled
   - Check API quotas and billing

2. **Authentication Errors**
   - Verify Clerk keys in environment
   - Check middleware configuration
   - Ensure test user IDs match Clerk dashboard

3. **Database Issues**
   - Run `npm run db:push` to sync schema
   - Check database connection
   - Verify test data cleanup between runs

4. **URL Parsing Failures**
   - Check network connectivity for shortened URLs
   - Verify URL format matches expected patterns
   - Test with fresh/valid Google Maps URLs

## Performance Testing

### Load Testing Scenarios

1. **Concurrent Onboarding**
   - Multiple users completing onboarding simultaneously
   - Google Places API rate limiting behavior
   - Database transaction performance

2. **Large Customer Lists**
   - Import 1000+ customers via CSV
   - Bulk review request creation
   - Dashboard performance with large datasets

### Monitoring During Tests

- Check API response times
- Monitor Google Places API usage
- Verify memory usage stays stable
- Test error recovery mechanisms

## Security Testing

### Authentication Flow Testing

1. **Token Validation**
   - Test expired tokens
   - Test invalid tokens
   - Test missing authorization headers

2. **Business Isolation**
   - Verify users can only access their own business data
   - Test cross-business data leaks
   - Validate business-scoped queries

3. **Input Validation**
   - Test SQL injection attempts
   - Validate XSS prevention
   - Test malformed request bodies

This testing framework provides comprehensive coverage for all onboarding scenarios and ensures reliable, repeatable testing workflows.
