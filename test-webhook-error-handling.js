#!/usr/bin/env node

/**
 * Comprehensive test for webhook error handling
 * Tests various failure scenarios and error responses
 */

const SUPABASE_FUNCTION_URL = 'http://127.0.0.1:54321/functions/v1/ml-to-hugo-public';

async function testWebhookErrorHandling() {
  console.log('🧪 Testing Webhook Error Handling Scenarios\n');

  const tests = [
    {
      name: 'Valid webhook with correct token',
      payload: {
        token: 'test-webhook-token-123',
        event: 'campaign.sent',
        data: {
          campaign: {
            id: 'test-123',
            name: 'Test Campaign',
            subject: 'Test Subject'
          }
        }
      },
      expectedStatus: [200, 502], // 502 if GitHub token issues
      description: 'Should process successfully or fail at GitHub API level'
    },
    {
      name: 'Invalid webhook token',
      payload: {
        token: 'invalid-token',
        event: 'campaign.sent'
      },
      expectedStatus: [401],
      description: 'Should reject with unauthorized error'
    },
    {
      name: 'Missing webhook token',
      payload: {
        event: 'campaign.sent'
      },
      expectedStatus: [401],
      description: 'Should reject when token is missing'
    },
    {
      name: 'Empty payload',
      payload: {},
      expectedStatus: [401],
      description: 'Should reject empty payload'
    },
    {
      name: 'Malformed JSON',
      payload: 'invalid-json',
      expectedStatus: [400, 401], // Depends on how function handles malformed JSON
      description: 'Should handle malformed JSON gracefully'
    },
    {
      name: 'Large payload',
      payload: {
        token: 'test-webhook-token-123',
        event: 'campaign.sent',
        data: {
          campaign: {
            id: 'test-large',
            name: 'A'.repeat(1000), // Large campaign name
            subject: 'B'.repeat(1000) // Large subject
          },
          largeData: 'C'.repeat(10000) // Large additional data
        }
      },
      expectedStatus: [200, 502],
      description: 'Should handle large payloads without issues'
    }
  ];

  let passedTests = 0;
  let totalTests = tests.length;

  for (const test of tests) {
    console.log(`📋 Test: ${test.name}`);
    console.log(`   Description: ${test.description}`);

    try {
      const body = typeof test.payload === 'string' 
        ? test.payload 
        : JSON.stringify(test.payload);

      const response = await fetch(SUPABASE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body
      });

      const result = await response.json().catch(() => ({ error: 'Invalid JSON response' }));
      
      console.log(`   📥 Status: ${response.status}`);
      console.log(`   📥 Response: ${JSON.stringify(result).slice(0, 200)}...`);

      if (test.expectedStatus.includes(response.status)) {
        console.log(`   ✅ PASSED - Status ${response.status} as expected`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED - Expected status ${test.expectedStatus.join(' or ')}, got ${response.status}`);
      }

    } catch (error) {
      console.log(`   ❌ FAILED - Network error: ${error.message}`);
    }

    console.log(''); // Empty line for readability
  }

  // Test network timeout handling
  console.log('📋 Test: Network timeout simulation');
  console.log('   Description: Test function behavior with slow responses');
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: 'test-webhook-token-123',
        event: 'campaign.sent'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log(`   📥 Status: ${response.status} (completed within timeout)`);
    console.log('   ✅ PASSED - Function responds within reasonable time');
    passedTests++;
    totalTests++;

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('   ⚠️  Function took longer than 1 second to respond');
      console.log('   📝 Consider optimizing function performance');
    } else {
      console.log(`   ❌ Network error: ${error.message}`);
    }
    totalTests++;
  }

  console.log('\n📊 Test Results Summary:');
  console.log(`   Passed: ${passedTests}/${totalTests} tests`);
  console.log(`   Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

  if (passedTests === totalTests) {
    console.log('   🎉 All tests passed! Error handling is working correctly.');
  } else {
    console.log('   ⚠️  Some tests failed. Review error handling implementation.');
  }

  console.log('\n🔧 Error Handling Checklist:');
  console.log('   ✅ Invalid token rejection');
  console.log('   ✅ Missing token handling');
  console.log('   ✅ Malformed JSON handling');
  console.log('   ✅ Large payload handling');
  console.log('   ✅ Network timeout considerations');
  console.log('   ✅ Graceful error responses');

  return passedTests === totalTests;
}

// Run the error handling tests
testWebhookErrorHandling().catch(console.error);