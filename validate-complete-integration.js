#!/usr/bin/env node

/**
 * Complete integration validation script
 * Validates all aspects of the MailerLite to GitHub integration
 */

const SUPABASE_FUNCTION_URL = 'http://127.0.0.1:54321/functions/v1/ml-to-hugo-public';

async function validateCompleteIntegration() {
  console.log('🔍 Complete MailerLite to GitHub Integration Validation\n');

  const validationResults = {
    supabaseFunction: false,
    webhookTokenValidation: false,
    errorHandling: false,
    githubWorkflowFile: false,
    githubApiAccess: false,
    endToEndFlow: false
  };

  // 1. Validate Supabase Function Deployment
  console.log('1. 📦 Validating Supabase Function Deployment...');
  try {
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (response.status === 401) {
      console.log('   ✅ Function is deployed and accessible');
      validationResults.supabaseFunction = true;
    } else {
      console.log('   ❌ Function deployment issue');
    }
  } catch (error) {
    console.log('   ❌ Function not accessible:', error.message);
  }

  // 2. Validate Webhook Token Authentication
  console.log('\n2. 🔐 Validating Webhook Token Authentication...');
  try {
    // Test invalid token
    const invalidResponse = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid' })
    });

    // Test valid token
    const validResponse = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test-webhook-token-123' })
    });

    if (invalidResponse.status === 401 && (validResponse.status === 200 || validResponse.status === 502)) {
      console.log('   ✅ Webhook token validation working correctly');
      validationResults.webhookTokenValidation = true;
    } else {
      console.log('   ❌ Webhook token validation issues');
    }
  } catch (error) {
    console.log('   ❌ Token validation test failed:', error.message);
  }

  // 3. Validate Error Handling
  console.log('\n3. 🛡️ Validating Error Handling...');
  try {
    // Test malformed JSON
    const malformedResponse = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json'
    });

    if (malformedResponse.status === 401 || malformedResponse.status === 400) {
      console.log('   ✅ Error handling working correctly');
      validationResults.errorHandling = true;
    } else {
      console.log('   ❌ Error handling needs improvement');
    }
  } catch (error) {
    console.log('   ❌ Error handling test failed:', error.message);
  }

  // 4. Validate GitHub Workflow File
  console.log('\n4. ⚙️ Validating GitHub Workflow Configuration...');
  try {
    const fs = require('fs');
    const workflowPath = '.github/workflows/deploy-gh-pages.yml';
    
    if (fs.existsSync(workflowPath)) {
      const content = fs.readFileSync(workflowPath, 'utf8');
      
      const hasWorkflowDispatch = content.includes('workflow_dispatch:');
      const hasInputs = content.includes('triggered_by:') && content.includes('timestamp:');
      const hasHugoSetup = content.includes('hugo');
      const hasGitHubPages = content.includes('gh-pages');

      if (hasWorkflowDispatch && hasInputs && hasHugoSetup && hasGitHubPages) {
        console.log('   ✅ GitHub workflow properly configured');
        validationResults.githubWorkflowFile = true;
      } else {
        console.log('   ⚠️ GitHub workflow missing some features');
        console.log(`      - Workflow dispatch: ${hasWorkflowDispatch ? '✅' : '❌'}`);
        console.log(`      - Custom inputs: ${hasInputs ? '✅' : '❌'}`);
        console.log(`      - Hugo setup: ${hasHugoSetup ? '✅' : '❌'}`);
        console.log(`      - GitHub Pages: ${hasGitHubPages ? '✅' : '❌'}`);
      }
    } else {
      console.log('   ❌ GitHub workflow file not found');
    }
  } catch (error) {
    console.log('   ❌ Workflow validation failed:', error.message);
  }

  // 5. Test GitHub API Access (if token available)
  console.log('\n5. 🐙 Testing GitHub API Access...');
  try {
    const fs = require('fs');
    let githubToken = process.env.GITHUB_TOKEN;
    
    if (!githubToken) {
      try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const tokenMatch = envContent.match(/GITHUB_TOKEN=(.+)/);
        if (tokenMatch && !tokenMatch[1].includes('REPLACE_WITH')) {
          githubToken = tokenMatch[1].trim();
        }
      } catch (error) {
        // .env file might not exist
      }
    }

    if (githubToken && !githubToken.includes('REPLACE_WITH')) {
      const response = await fetch('https://api.github.com/repos/captjreacher/mgrnz-blog', {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json'
        }
      });

      if (response.ok) {
        console.log('   ✅ GitHub API access working');
        validationResults.githubApiAccess = true;
      } else {
        console.log('   ❌ GitHub API access failed:', response.status);
      }
    } else {
      console.log('   ⚠️ No GitHub token available for testing');
    }
  } catch (error) {
    console.log('   ❌ GitHub API test failed:', error.message);
  }

  // 6. Test End-to-End Flow
  console.log('\n6. 🔄 Testing End-to-End Flow...');
  try {
    const mockPayload = {
      token: 'test-webhook-token-123',
      event: 'campaign.sent',
      data: {
        campaign: {
          id: 'validation-test-' + Date.now(),
          name: 'Integration Validation Test',
          subject: 'Testing Complete Integration'
        }
      }
    };

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockPayload)
    });

    const result = await response.json();

    if (response.status === 200 && result.ok) {
      console.log('   ✅ End-to-end flow working perfectly');
      validationResults.endToEndFlow = true;
    } else if (response.status === 502 && result.status === 404) {
      console.log('   ⚠️ End-to-end flow partially working (GitHub token issue)');
      console.log('   📝 Function processes webhook but GitHub API returns 404');
    } else {
      console.log('   ❌ End-to-end flow has issues');
    }
  } catch (error) {
    console.log('   ❌ End-to-end test failed:', error.message);
  }

  // Generate Final Report
  console.log('\n📊 Integration Validation Report');
  console.log('=====================================');
  
  const totalChecks = Object.keys(validationResults).length;
  const passedChecks = Object.values(validationResults).filter(Boolean).length;
  const successRate = Math.round((passedChecks / totalChecks) * 100);

  console.log(`Overall Status: ${successRate}% Complete`);
  console.log(`Passed: ${passedChecks}/${totalChecks} validations\n`);

  Object.entries(validationResults).forEach(([check, passed]) => {
    const status = passed ? '✅' : '❌';
    const name = check.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    console.log(`${status} ${name}`);
  });

  console.log('\n🔧 Required Actions:');
  if (!validationResults.githubApiAccess) {
    console.log('   1. Configure GITHUB_TOKEN in Supabase Edge Function secrets');
    console.log('   2. Ensure token has repo and workflow permissions');
  }
  if (!validationResults.endToEndFlow) {
    console.log('   3. Test with actual MailerLite webhook');
  }
  
  console.log('\n✅ Ready for Production:');
  if (successRate >= 80) {
    console.log('   🎉 Integration is ready for production use!');
    console.log('   📝 Configure production tokens and test with real webhooks');
  } else {
    console.log('   ⚠️ Complete remaining validations before production use');
  }

  return successRate >= 80;
}

// Run the complete validation
validateCompleteIntegration().catch(console.error);