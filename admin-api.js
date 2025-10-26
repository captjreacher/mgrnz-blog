const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Get post content
app.get('/api/posts/:slug', (req, res) => {
  const slug = req.params.slug;
  const bundlePath = path.join(__dirname, 'content', 'posts', slug, 'index.md');
  const singlePath = path.join(__dirname, 'content', 'posts', `${slug}.md`);
  
  try {
    let postPath;
    if (fs.existsSync(bundlePath)) {
      postPath = bundlePath;
    } else if (fs.existsSync(singlePath)) {
      postPath = singlePath;
    } else {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    const content = fs.readFileSync(postPath, 'utf8');
    res.json({ success: true, content, path: postPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update post content
app.put('/api/posts/:slug', (req, res) => {
  const slug = req.params.slug;
  const { content } = req.body;
  const bundlePath = path.join(__dirname, 'content', 'posts', slug, 'index.md');
  const singlePath = path.join(__dirname, 'content', 'posts', `${slug}.md`);
  
  try {
    let postPath;
    if (fs.existsSync(bundlePath)) {
      postPath = bundlePath;
    } else if (fs.existsSync(singlePath)) {
      postPath = singlePath;
    } else {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    fs.writeFileSync(postPath, content, 'utf8');
    res.json({ success: true, message: 'Post updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete post
app.delete('/api/posts/:slug', (req, res) => {
  const slug = req.params.slug;
  const postDir = path.join(__dirname, 'content', 'posts', slug);
  
  try {
    if (fs.existsSync(postDir)) {
      fs.rmSync(postDir, { recursive: true, force: true });
      res.json({ success: true, message: 'Post deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Post not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new post
app.post('/api/posts', (req, res) => {
  const { slug, content } = req.body;
  const postDir = path.join(__dirname, 'content', 'posts', slug);
  const postPath = path.join(postDir, 'index.md');
  
  try {
    if (!fs.existsSync(postDir)) {
      fs.mkdirSync(postDir, { recursive: true });
    }
    
    fs.writeFileSync(postPath, content, 'utf8');
    res.json({ success: true, message: 'Post created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Admin API server running on http://localhost:${PORT}`);
});