#!/usr/bin/env tsx

import { logger } from '../lib/logger';
import { GooglePlacesServiceImpl } from '../services/google-places';
import { TEST_USERS } from './reset-test-data';

interface OnboardingTestResult {
  testUserId: string;
  businessName: string;
  googleUrlProvided: boolean;
  placeExtractionSuccess: boolean;
  businessDetailsFound: boolean;
  error?: string;
}

class OnboardingTester {
  private googlePlacesService: GooglePlacesServiceImpl;

  constructor() {
    this.googlePlacesService = new GooglePlacesServiceImpl();
  }

  /**
   * Test Google Places integration for all test users
   */
  async testGooglePlacesIntegration(): Promise<OnboardingTestResult[]> {
    const results: OnboardingTestResult[] = [];

    console.log('🧪 Testing Google Places Integration for All Test Users\n');

    for (const testUser of TEST_USERS) {
      console.log(`Testing: ${testUser.name} (${testUser.clerkUserId})`);

      const result: OnboardingTestResult = {
        testUserId: testUser.clerkUserId,
        businessName: testUser.name,
        googleUrlProvided: !!testUser.googleMapsUrl,
        placeExtractionSuccess: false,
        businessDetailsFound: false,
      };

      if (testUser.googleMapsUrl) {
        try {
          // Test URL parsing and place extraction
          const placeDetails = await this.googlePlacesService.getBusinessFromUrl(
            testUser.googleMapsUrl
          );

          if (placeDetails) {
            result.placeExtractionSuccess = true;
            result.businessDetailsFound = true;
            console.log(`  ✅ Successfully extracted: ${placeDetails.name}`);
            console.log(`  📍 Address: ${placeDetails.formatted_address}`);
            if (placeDetails.formatted_phone_number) {
              console.log(`  📞 Phone: ${placeDetails.formatted_phone_number}`);
            }
          } else {
            result.error = 'Could not extract place details from URL';
            console.log(`  ❌ Failed to extract place details`);
          }
        } catch (error) {
          result.error = error instanceof Error ? error.message : String(error);
          console.log(`  ❌ Error: ${result.error}`);
        }
      } else {
        console.log(`  ⚠️  No Google Maps URL provided (skip scenario)`);
      }

      results.push(result);
      console.log('');
    }

    return results;
  }

  /**
   * Test business name search fallback
   */
  async testBusinessNameSearch(): Promise<void> {
    console.log('🔍 Testing Business Name Search Fallback\n');

    const testBusinessNames = [
      "McDonald's",
      'Starbucks Coffee',
      'Local Hair Salon London',
      'Pizza Express',
      'Tesco Express',
    ];

    for (const businessName of testBusinessNames) {
      console.log(`Searching for: ${businessName}`);

      try {
        const searchResults = await this.googlePlacesService.searchPlaces(businessName);

        if (searchResults && searchResults.length > 0) {
          console.log(`  ✅ Found ${searchResults.length} results`);
          console.log(
            `  Top result: ${searchResults[0].name} - ${searchResults[0].formatted_address}`
          );
        } else {
          console.log(`  ❌ No results found`);
        }
      } catch (error) {
        console.log(`  ❌ Search error: ${error instanceof Error ? error.message : String(error)}`);
      }

      console.log('');
    }
  }

  /**
   * Generate test report
   */
  generateTestReport(results: OnboardingTestResult[]): void {
    console.log('📊 Test Results Summary\n');

    const totalTests = results.length;
    const urlProvidedTests = results.filter(r => r.googleUrlProvided).length;
    const successfulExtractions = results.filter(r => r.placeExtractionSuccess).length;
    const failedTests = results.filter(r => r.googleUrlProvided && !r.placeExtractionSuccess);

    console.log(`Total Test Users: ${totalTests}`);
    console.log(`Users with Google URLs: ${urlProvidedTests}`);
    console.log(`Successful Place Extractions: ${successfulExtractions}/${urlProvidedTests}`);
    console.log(
      `Success Rate: ${urlProvidedTests > 0 ? ((successfulExtractions / urlProvidedTests) * 100).toFixed(1) : 0}%\n`
    );

    if (failedTests.length > 0) {
      console.log('❌ Failed Tests:');
      failedTests.forEach(test => {
        console.log(`  • ${test.businessName}: ${test.error || 'Unknown error'}`);
      });
      console.log('');
    }

    console.log('💡 Testing Recommendations:');
    console.log('1. Test with different URL formats (share links, browser URLs, shortened URLs)');
    console.log("2. Test with businesses that don't have Google listings");
    console.log("3. Test the skip flow for users who can't find their business");
    console.log('4. Test manual business entry after skipping Google connection');
  }

  /**
   * Simulate different onboarding scenarios
   */
  async simulateOnboardingScenarios(): Promise<void> {
    console.log('🎭 Simulating Different Onboarding Scenarios\n');

    const scenarios = [
      {
        name: 'Happy Path - Valid Google Maps URL',
        description: 'User provides a valid Google Maps share link',
        testUrl: 'https://maps.app.goo.gl/cGdbAmiUuP3y8ur37',
      },
      {
        name: 'Browser URL Path',
        description: 'User copies URL from browser address bar',
        testUrl: 'https://maps.google.com/maps/place/Test+Business/@-33.8688,151.2093,17z',
      },
      {
        name: 'Invalid URL',
        description: 'User provides an invalid or non-Google URL',
        testUrl: 'https://example.com/not-google-maps',
      },
      {
        name: 'No URL Provided',
        description: 'User skips Google connection step',
        testUrl: '',
      },
    ];

    for (const scenario of scenarios) {
      console.log(`Scenario: ${scenario.name}`);
      console.log(`Description: ${scenario.description}`);

      if (scenario.testUrl) {
        try {
          const placeDetails = await this.googlePlacesService.getBusinessFromUrl(scenario.testUrl);

          if (placeDetails) {
            console.log(`  ✅ Success: Found ${placeDetails.name}`);
          } else {
            console.log(`  ❌ Failed: Could not extract business details`);
          }
        } catch (error) {
          console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        console.log(`  ⏭️  Skip: User would proceed without Google connection`);
      }

      console.log('');
    }
  }

  /**
   * Run full test suite
   */
  async runFullTestSuite(): Promise<void> {
    try {
      console.log('🚀 Starting Onboarding Flow Test Suite\\n');

      // Test Google Places integration
      const results = await this.testGooglePlacesIntegration();

      // Test business name search
      await this.testBusinessNameSearch();

      // Simulate different scenarios
      await this.simulateOnboardingScenarios();

      // Generate report
      this.generateTestReport(results);

      console.log('\\n🎉 Test suite completed!');
    } catch (error) {
      logger.error('Test suite failed', { error });
      console.error('❌ Test suite failed:', error);
      throw error;
    }
  }
}

// Run if called directly
if (require.main === module) {
  const tester = new OnboardingTester();
  tester
    .runFullTestSuite()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { OnboardingTester };
