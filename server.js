const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const POSTS_FILE = path.join(__dirname, 'posts.json');
const ADMIN_PASSWORD = 'AdminPlayPC2026';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Create posts.json if it does not exist
function ensurePostsFile() {
    if (!fs.existsSync(POSTS_FILE)) {
        fs.writeFileSync(POSTS_FILE, '[]', 'utf8');
    }
}

// Read posts
function readPosts() {
    ensurePostsFile();

    try {
        const data = fs.readFileSync(POSTS_FILE, 'utf8');
        const posts = JSON.parse(data);

        return Array.isArray(posts) ? posts : [];
    } catch (error) {
        console.error('Ошибка чтения posts.json:', error);
        return [];
    }
}

// Save posts
function savePosts(posts) {
    fs.writeFileSync(
        POSTS_FILE,
        JSON.stringify(posts, null, 2),
        'utf8'
    );
}

// GET /api/posts
app.get('/api/posts', (req, res) => {
    try {
        const posts = readPosts();
        res.status(200).json(posts);
    } catch (error) {
        console.error('Ошибка GET /api/posts:', error);
        res.status(500).json({
            error: 'Ошибка сервера'
        });
    }
});

// POST /api/posts
app.post('/api/posts', (req, res) => {
    try {
        const {
            title,
            platform,
            imageUrl,
            content,
            password
        } = req.body;

        // Check admin password
        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({
                error: 'Ошибка доступа'
            });
        }

        // Validate required fields
        if (
            typeof title !== 'string' ||
            typeof platform !== 'string' ||
            typeof imageUrl !== 'string' ||
            typeof content !== 'string'
        ) {
            return res.status(400).json({
                error: 'Некорректные данные поста'
            });
        }

        const posts = readPosts();

        const newPost = {
            id: Date.now().toString(),
            title: title.trim(),
            platform: platform.trim(),
            imageUrl: imageUrl.trim(),
            content: content.trim(),
            createdAt: new Date().toISOString()
        };

        posts.push(newPost);
        savePosts(posts);

        return res.status(201).json(newPost);
    } catch (error) {
        console.error('Ошибка POST /api/posts:', error);

        return res.status(500).json({
            error: 'Ошибка сервера'
        });
    }
});

// Ensure posts.json exists on startup
ensurePostsFile();

// Start server
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});