#!/usr/bin/env node

/**
 * Test posts accessibility after folder structure change
 * Verifies that all posts can be accessed via their URLs
 */

const fs = require('fs');
const path = require('path');

function testPostsAccessibility() {
  console.log('🔗 Testing Posts Accessibility\n');

  const postsDir = 'content/posts';
  const publicDir = 'public-test';
  
  if (!fs.existsSync(publicDir)) {
    console.log('❌ Public directory not found. Run hugo build first.');
    return false;
  }

  const posts = [];
  
  // Collect all posts
  function collectPosts(dir, relativePath = '') {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relPath = path.join(relativePath, item.name);
      
      if (item.isDirectory()) {
        collectPosts(fullPath, relPath);
      } else if (item.name.endsWith('.md')) {
        // Read post to get slug and title
        const content = fs.readFileSync(fullPath, 'utf8');
        const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          const titleMatch = frontmatter.match(/title:\s*"([^"]+)"/);
          const dateMatch = frontmatter.match(/date:\s*(.+)/);
          
          if (titleMatch && dateMatch) {
            const slug = item.name.replace('.md', '');
            // Extract year and month from file path
            const pathParts = relPath.split(path.sep);
            const year = pathParts[0];
            const monthFolder = pathParts[1];
            const monthName = monthFolder.toLowerCase();
            
            posts.push({
              title: titleMatch[1],
              date: dateMatch[1],
              slug: slug,
              file: relPath,
              year: year,
              monthFolder: monthName,
              expectedUrl: `/posts/${year}/${monthName}/${slug}/`
            });
          }
        }
      }
    }
  }

  collectPosts(postsDir);
  
  console.log(`📄 Found ${posts.length} posts:\n`);
  
  let accessiblePosts = 0;
  
  for (const post of posts) {
    console.log(`📝 ${post.title}`);
    console.log(`   📅 Date: ${post.date}`);
    console.log(`   📁 File: ${post.file}`);
    console.log(`   🔗 Expected URL: ${post.expectedUrl}`);
    
    // Check if Hugo generated the post page
    const postDir = path.join(publicDir, 'posts', post.year, post.monthFolder, post.slug);
    const indexFile = path.join(postDir, 'index.html');
    
    if (fs.existsSync(indexFile)) {
      console.log(`   ✅ Generated: ${indexFile}`);
      accessiblePosts++;
    } else {
      console.log(`   ❌ Not found: ${indexFile}`);
    }
    console.log('');
  }

  console.log('📊 Summary:');
  console.log(`   Total posts: ${posts.length}`);
  console.log(`   Accessible: ${accessiblePosts}`);
  console.log(`   Success rate: ${Math.round((accessiblePosts / posts.length) * 100)}%`);

  if (accessiblePosts === posts.length) {
    console.log('\n🎉 All posts are accessible! Folder structure migration successful.');
  } else {
    console.log('\n⚠️  Some posts are not accessible. Check Hugo configuration.');
  }

  return accessiblePosts === posts.length;
}

// Run the test
testPostsAccessibility();