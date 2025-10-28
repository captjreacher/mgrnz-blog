#!/usr/bin/env node

/**
 * Script to help configure GitHub secrets for Supabase integration
 * Provides instructions and validation for GitHub token setup
 */

async function configureGitHubSecrets() {
  console.log('🔧 GitHub Secrets Configuration Helper\n');

  console.log('📋 Current Configuration:');
  console.log('   - Repository: captjreacher/mgrnz-blog');
  console.log('   - Workflow: deploy-gh-pages.yml');
  console.log('   - Function: ml-to-hugo-public');

  console.log('\n🔑 GitHub Token Requirements:');
  console.log('   The GITHUB_TOKEN needs the following permissions:');
  console.log('   - Repository access: captjreacher/mgrnz-blog');
  console.log('   - Scope: repo (full repository access)');
  console.log('   - Workflow permissions: actions:write');

  console.log('\n📝 Setup Instructions:');
  console.log('   1. Go to GitHub Settings > Developer settings > Personal access tokens');
  console.log('   2. Create a new token (classic) with these scopes:');
  console.log('      ✓ repo (Full control of private repositories)');
  console.log('      ✓ workflow (Update GitHub Action workflows)');
  console.log('   3. Copy the generated token');

  console.log('\n🔧 Supabase Configuration:');
  console.log('   1. Go to your Supabase project dashboard');
  console.log('   2. Navigate to Edge Functions > ml-to-hugo-public');
  console.log('   3. Go to Settings/Secrets');
  console.log('   4. Add/Update these secrets:');
  console.log('      - GITHUB_TOKEN: [your-github-token]');
  console.log('      - WEBHOOK_TOKEN: [your-webhook-token-for-mailerlite]');
  console.log('      - GITHUB_REPO: mgrnz-blog (already configured)');

  console.log('\n🧪 Testing Commands:');
  console.log('   After configuration, test with:');
  console.log('   - node test-github-integration.js');
  console.log('   - node test-supabase-webhook-config.js');

  console.log('\n⚠️  Security Notes:');
  console.log('   - Never commit GitHub tokens to version control');
  console.log('   - Use environment-specific tokens for production');
  console.log('   - Regularly rotate tokens for security');

  console.log('\n🔍 Troubleshooting:');
  console.log('   If you get 404 errors:');
  console.log('   - Verify the repository name is correct');
  console.log('   - Check token has access to the repository');
  console.log('   - Ensure workflow file exists and is named correctly');

  console.log('\n✅ Verification:');
  console.log('   Once configured, the webhook should:');
  console.log('   1. Receive MailerLite campaign.sent events');
  console.log('   2. Validate the WEBHOOK_TOKEN');
  console.log('   3. Trigger GitHub Actions workflow dispatch');
  console.log('   4. Deploy the site with new content');
}

// Run the configuration helper
configureGitHubSecrets().catch(console.error);