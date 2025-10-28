#!/usr/bin/env node

/**
 * Validate posts folder structure
 * Ensures all posts follow the YYYY/DD-MMMM/Post-name.md format
 */

const fs = require('fs');
const path = require('path');

function validatePostsStructure() {
  console.log('📁 Validating Posts Folder Structure\n');

  const postsDir = 'content/posts';
  
  if (!fs.existsSync(postsDir)) {
    console.log('❌ Posts directory not found');
    return false;
  }

  const years = fs.readdirSync(postsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  console.log(`📅 Found ${years.length} year(s): ${years.join(', ')}\n`);

  let totalPosts = 0;
  let validStructure = true;

  for (const year of years) {
    const yearPath = path.join(postsDir, year);
    console.log(`📂 Checking year: ${year}`);

    const months = fs.readdirSync(yearPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      console.log(`  📂 Month folder: ${month}`);

      // Validate month format (DD-MMMM)
      const monthPattern = /^\d{2}-(January|February|March|April|May|June|July|August|September|October|November|December)$/;
      if (!monthPattern.test(month)) {
        console.log(`    ⚠️  Invalid month format: ${month} (should be DD-MMMM)`);
        validStructure = false;
      }

      const posts = fs.readdirSync(monthPath, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'))
        .map(dirent => dirent.name);

      console.log(`    📄 Found ${posts.length} post(s): ${posts.join(', ')}`);
      totalPosts += posts.length;

      // Check each post
      for (const post of posts) {
        const postPath = path.join(monthPath, post);
        try {
          const content = fs.readFileSync(postPath, 'utf8');
          
          // Extract frontmatter
          const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const dateMatch = frontmatter.match(/date:\s*(.+)/);
            
            if (dateMatch) {
              const postDate = new Date(dateMatch[1]);
              const postYear = postDate.getFullYear().toString();
              const postDay = String(postDate.getDate()).padStart(2, '0');
              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                'July', 'August', 'September', 'October', 'November', 'December'];
              const postMonth = monthNames[postDate.getMonth()];
              const expectedFolder = `${postDay}-${postMonth}`;

              console.log(`      📅 Post date: ${dateMatch[1]}`);
              console.log(`      📁 Expected folder: ${postYear}/${expectedFolder}`);
              console.log(`      📁 Actual folder: ${year}/${month}`);

              if (year !== postYear || month !== expectedFolder) {
                console.log(`      ❌ Folder mismatch for ${post}`);
                validStructure = false;
              } else {
                console.log(`      ✅ Correct folder structure`);
              }
            } else {
              console.log(`      ⚠️  No date found in frontmatter for ${post}`);
            }
          } else {
            console.log(`      ⚠️  No frontmatter found in ${post}`);
          }
        } catch (error) {
          console.log(`      ❌ Error reading ${post}: ${error.message}`);
        }
      }
      console.log('');
    }
  }

  console.log('📊 Summary:');
  console.log(`   Total posts: ${totalPosts}`);
  console.log(`   Structure valid: ${validStructure ? '✅ Yes' : '❌ No'}`);

  if (validStructure) {
    console.log('\n🎉 All posts follow the correct YYYY/DD-MMMM/Post-name.md structure!');
  } else {
    console.log('\n⚠️  Some posts need to be moved to match their dates.');
  }

  return validStructure;
}

// Run the validation
validatePostsStructure();