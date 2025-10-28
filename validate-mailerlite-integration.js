// MailerLite Integration Validation Script
// This script tests the MailerLite subscription integration

const MAILERLITE_CONFIG = {
    accountId: '1849787',
    formId: '169453382423020905',
    endpoint: 'https://assets.mailerlite.com/jsonp/1849787/forms/169453382423020905/subscribe'
};

console.log('🔍 MailerLite Integration Validation');
console.log('=====================================');

// Test 1: Check MailerLite Universal Script
function testUniversalScript() {
    console.log('\n1. Testing MailerLite Universal Script...');
    
    if (typeof ml !== 'undefined') {
        console.log('✅ MailerLite Universal script is loaded');
        console.log(`   Account ID: ${MAILERLITE_CONFIG.accountId}`);
        return true;
    } else {
        console.log('❌ MailerLite Universal script is NOT loaded');
        console.log('   Check if the script is included in the page head');
        return false;
    }
}

// Test 2: Check Form Configuration
function testFormConfiguration() {
    console.log('\n2. Testing Form Configuration...');
    
    const subscribeForm = document.getElementById('subscribe-form');
    if (subscribeForm) {
        console.log('✅ Main subscribe form found');
        console.log(`   Action: ${subscribeForm.action}`);
        
        if (subscribeForm.action.includes(MAILERLITE_CONFIG.accountId)) {
            console.log('✅ Account ID matches in form action');
        } else {
            console.log('❌ Account ID mismatch in form action');
        }
        
        if (subscribeForm.action.includes(MAILERLITE_CONFIG.formId)) {
            console.log('✅ Form ID matches in form action');
        } else {
            console.log('❌ Form ID mismatch in form action');
        }
        
        return true;
    } else {
        console.log('❌ Main subscribe form not found');
        return false;
    }
}

// Test 3: Check Embedded Form
function testEmbeddedForm() {
    console.log('\n3. Testing Embedded Form...');
    
    const embeddedForm = document.querySelector('.ml-embedded');
    if (embeddedForm) {
        console.log('✅ Embedded form container found');
        
        const dataForm = embeddedForm.getAttribute('data-form');
        if (dataForm === MAILERLITE_CONFIG.formId) {
            console.log('✅ Embedded form ID matches configuration');
        } else {
            console.log(`❌ Embedded form ID mismatch: ${dataForm} vs ${MAILERLITE_CONFIG.formId}`);
        }
        
        return true;
    } else {
        console.log('❌ Embedded form container not found');
        return false;
    }
}

// Test 4: Test API Endpoint Accessibility
async function testAPIEndpoint() {
    console.log('\n4. Testing API Endpoint Accessibility...');
    
    try {
        // Create a test form submission
        const formData = new FormData();
        formData.append('fields[email]', 'test@example.com');
        formData.append('fields[name]', 'Test User');
        formData.append('ml-submit', '1');
        formData.append('anticsrf', 'true');
        
        const response = await fetch(MAILERLITE_CONFIG.endpoint, {
            method: 'POST',
            body: formData,
            mode: 'no-cors' // Required for MailerLite
        });
        
        console.log('✅ API endpoint is accessible');
        console.log('   Note: Due to CORS restrictions, we cannot read the response');
        console.log('   But the request was sent successfully');
        return true;
        
    } catch (error) {
        console.log('❌ API endpoint test failed');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

// Test 5: Check Form Validation
function testFormValidation() {
    console.log('\n5. Testing Form Validation...');
    
    const subscribeForm = document.getElementById('subscribe-form');
    if (!subscribeForm) {
        console.log('❌ Cannot test validation - form not found');
        return false;
    }
    
    const emailInput = subscribeForm.querySelector('input[name="fields[email]"]');
    const nameInput = subscribeForm.querySelector('input[name="fields[name]"]');
    
    if (emailInput && nameInput) {
        console.log('✅ Required form fields found');
        
        // Check if fields have proper attributes
        if (emailInput.type === 'email') {
            console.log('✅ Email input has correct type');
        } else {
            console.log('❌ Email input type is not "email"');
        }
        
        if (emailInput.required || emailInput.hasAttribute('required')) {
            console.log('✅ Email field is marked as required');
        } else {
            console.log('⚠️  Email field is not marked as required');
        }
        
        return true;
    } else {
        console.log('❌ Required form fields missing');
        return false;
    }
}

// Test 6: Check Error Handling Elements
function testErrorHandling() {
    console.log('\n6. Testing Error Handling Elements...');
    
    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');
    
    let hasErrorHandling = true;
    
    if (successMessage) {
        console.log('✅ Success message element found');
    } else {
        console.log('❌ Success message element not found');
        hasErrorHandling = false;
    }
    
    if (errorMessage) {
        console.log('✅ Error message element found');
    } else {
        console.log('❌ Error message element not found');
        hasErrorHandling = false;
    }
    
    return hasErrorHandling;
}

// Run all tests
async function runAllTests() {
    console.log('Starting MailerLite integration validation...\n');
    
    const results = {
        universalScript: testUniversalScript(),
        formConfiguration: testFormConfiguration(),
        embeddedForm: testEmbeddedForm(),
        apiEndpoint: await testAPIEndpoint(),
        formValidation: testFormValidation(),
        errorHandling: testErrorHandling()
    };
    
    console.log('\n📊 Test Results Summary');
    console.log('========================');
    
    let passedTests = 0;
    let totalTests = Object.keys(results).length;
    
    for (const [test, passed] of Object.entries(results)) {
        const status = passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${test}: ${status}`);
        if (passed) passedTests++;
    }
    
    console.log(`\nOverall: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed! MailerLite integration looks good.');
    } else {
        console.log('⚠️  Some tests failed. Please review the issues above.');
    }
    
    // Provide recommendations
    console.log('\n💡 Recommendations:');
    if (!results.universalScript) {
        console.log('- Add MailerLite Universal script to page head');
    }
    if (!results.formConfiguration) {
        console.log('- Check form action URL and IDs');
    }
    if (!results.embeddedForm) {
        console.log('- Verify embedded form configuration');
    }
    if (!results.apiEndpoint) {
        console.log('- Check network connectivity and API endpoint');
    }
    if (!results.formValidation) {
        console.log('- Implement proper form validation');
    }
    if (!results.errorHandling) {
        console.log('- Add error handling UI elements');
    }
    
    return results;
}

// Export for use in browser console or testing
if (typeof window !== 'undefined') {
    window.validateMailerLite = runAllTests;
    
    // Auto-run if script is loaded directly
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runAllTests);
    } else {
        runAllTests();
    }
}

// Export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runAllTests, MAILERLITE_CONFIG };
}