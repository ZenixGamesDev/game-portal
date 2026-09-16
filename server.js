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

// Read posts from posts.json
function readPosts() {
    ensurePostsFile();

    try {
        const data = fs.readFileSync(POSTS_FILE, 'utf8');
        const posts = JSON.parse(data);

        if (!Array.isArray(posts)) {
            throw new Error('posts.json должен содержать массив');
        }

        return posts;
    } catch (error) {
        console.error('Ошибка чтения posts.json:', error);
        throw error;
    }
}

// Save posts to posts.json
function savePosts(posts) {
    fs.writeFileSync(
        POSTS_FILE,
        JSON.stringify(posts, null, 2),
        'utf8'
    );
}

// Sort posts:
// 1. Pinned posts first
// 2. Inside each group — newest to oldest
function sortPosts(posts) {
    return [...posts].sort((a, b) => {
        const pinnedA = a.pinned === true ? 1 : 0;
        const pinnedB = b.pinned === true ? 1 : 0;

        if (pinnedA !== pinnedB) {
            return pinnedB - pinnedA;
        }

        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();

        return dateB - dateA;
    });
}

// GET /api/posts
app.get('/api/posts', (req, res) => {
    try {
        const posts = readPosts();
        const sortedPosts = sortPosts(posts);

        return res.status(200).json(sortedPosts);
    } catch (error) {
        console.error('Ошибка GET /api/posts:', error);

        return res.status(500).json({
            error: 'Ошибка сервера при чтении новостей'
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
            password,
            pinned
        } = req.body;

        // Admin authentication
        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({
                error: 'Ошибка доступа'
            });
        }

        // Validate basic types
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

        const cleanTitle = title.trim();
        const cleanPlatform = platform.trim();
        const cleanImageUrl = imageUrl.trim();
        const cleanContent = content.trim();

        // Validate required fields
        if (
            !cleanTitle ||
            !cleanPlatform ||
            !cleanImageUrl ||
            !cleanContent
        ) {
            return res.status(400).json({
                error: 'Все поля поста обязательны'
            });
        }

        // Validate platform
        if (
            cleanPlatform !== 'PC' &&
            cleanPlatform !== 'PlayStation'
        ) {
            return res.status(400).json({
                error: 'Недопустимая платформа'
            });
        }

        const posts = readPosts();

        // Generate unique ID
        let id = Date.now().toString();

        while (posts.some(post => String(post.id) === id)) {
            id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
        }

        // Accept boolean true or string "true"
        const isPinned =
            pinned === true ||
            pinned === 'true';

        const newPost = {
            id,
            title: cleanTitle,
            platform: cleanPlatform,
            imageUrl: cleanImageUrl,
            content: cleanContent,
            pinned: isPinned,
            votesWillPlay: 0,
            votesWontPlay: 0,
            createdAt: new Date().toISOString()
        };

        posts.push(newPost);

        savePosts(posts);

        return res.status(201).json(newPost);
    } catch (error) {
        console.error('Ошибка POST /api/posts:', error);

        return res.status(500).json({
            error: 'Ошибка сервера при создании новости'
        });
    }
});

// POST /api/posts/:id/vote
app.post('/api/posts/:id/vote', (req, res) => {
    try {
        const postId = String(req.params.id);
        const { type } = req.body;

        // Validate vote type
        if (
            type !== 'willPlay' &&
            type !== 'wontPlay'
        ) {
            return res.status(400).json({
                error: 'Недопустимый тип голоса'
            });
        }

        const posts = readPosts();

        const postIndex = posts.findIndex(
            post => String(post.id) === postId
        );

        if (postIndex === -1) {
            return res.status(404).json({
                error: 'Пост не найден'
            });
        }

        const post = posts[postIndex];

        // Ensure counters exist for older posts
        if (
            typeof post.votesWillPlay !== 'number' ||
            !Number.isFinite(post.votesWillPlay)
        ) {
            post.votesWillPlay = 0;
        }

        if (
            typeof post.votesWontPlay !== 'number' ||
            !Number.isFinite(post.votesWontPlay)
        ) {
            post.votesWontPlay = 0;
        }

        if (type === 'willPlay') {
            post.votesWillPlay += 1;
        }

        if (type === 'wontPlay') {
            post.votesWontPlay += 1;
        }

        posts[postIndex] = post;

        savePosts(posts);

        return res.status(200).json(post);
    } catch (error) {
        console.error(
            'Ошибка POST /api/posts/:id/vote:',
            error
        );

        return res.status(500).json({
            error: 'Ошибка сервера при сохранении голоса'
        });
    }
});

// DELETE /api/posts/:id
app.delete('/api/posts/:id', (req, res) => {
    try {
        const postId = String(req.params.id);

        const password =
            req.body?.password ||
            req.get('X-Admin-Password');

        // Admin authentication
        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({
                error: 'Ошибка доступа'
            });
        }

        const posts = readPosts();

        const postIndex = posts.findIndex(
            post => String(post.id) === postId
        );

        if (postIndex === -1) {
            return res.status(404).json({
                error: 'Пост не найден'
            });
        }

        const deletedPost = posts[postIndex];

        posts.splice(postIndex, 1);

        savePosts(posts);

        return res.status(200).json({
            success: true,
            message: 'Пост успешно удален',
            post: deletedPost
        });
    } catch (error) {
        console.error(
            'Ошибка DELETE /api/posts/:id:',
            error
        );

        return res.status(500).json({
            error: 'Ошибка сервера при удалении новости'
        });
    }
});

// Make sure posts.json exists before starting server
try {
    ensurePostsFile();
} catch (error) {
    console.error(
        'Не удалось создать posts.json:',
        error
    );

    process.exit(1);
}

// Start server
app.listen(PORT, () => {
    console.log(
        `PlayPC сервер запущен на порту ${PORT}`
    );
});