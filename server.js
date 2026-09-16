const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = "AdminPlayPC2026";

const POSTS_FILE = path.join(__dirname, "posts.json");
const RELEASES_FILE = path.join(__dirname, "releases.json");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function ensureJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "[]", "utf8");
        return;
    }

    try {
        const content = fs.readFileSync(filePath, "utf8").trim();
        const parsed = content ? JSON.parse(content) : [];

        if (!Array.isArray(parsed)) {
            fs.writeFileSync(filePath, "[]", "utf8");
        }
    } catch (error) {
        fs.writeFileSync(filePath, "[]", "utf8");
    }
}

function readData(filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf8").trim();

        if (!content) {
            return [];
        }

        const data = JSON.parse(content);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

function writeData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function isAdmin(password) {
    return password === ADMIN_PASSWORD;
}

ensureJsonFile(POSTS_FILE);
ensureJsonFile(RELEASES_FILE);

/* =========================
   POSTS API
========================= */

app.get("/api/posts", (req, res) => {
    const posts = readData(POSTS_FILE);

    const sortedPosts = [...posts].sort((a, b) => {
        const aPinned = a.pinned === true;
        const bPinned = b.pinned === true;

        if (aPinned !== bPinned) {
            return aPinned ? -1 : 1;
        }

        const aTime = Number(a.createdAt) || Number(a.id) || 0;
        const bTime = Number(b.createdAt) || Number(b.id) || 0;

        return bTime - aTime;
    });

    res.json(sortedPosts);
});

app.post("/api/posts", (req, res) => {
    const {
        title,
        platform,
        imageUrl,
        content,
        password,
        pinned
    } = req.body;

    if (!isAdmin(password)) {
        return res.status(401).json({
            error: "Ошибка доступа"
        });
    }

    if (
        typeof title !== "string" ||
        typeof platform !== "string" ||
        typeof imageUrl !== "string" ||
        typeof content !== "string" ||
        !title.trim() ||
        !platform.trim() ||
        !content.trim()
    ) {
        return res.status(400).json({
            error: "Заполните все обязательные поля"
        });
    }

    if (!["PC", "PlayStation"].includes(platform)) {
        return res.status(400).json({
            error: "Недопустимая платформа"
        });
    }

    const posts = readData(POSTS_FILE);
    const now = Date.now();

    const newPost = {
        id: now.toString(),
        title: title.trim(),
        platform,
        imageUrl: imageUrl.trim(),
        content: content.trim(),
        pinned: pinned === true || pinned === "true",
        votesWillPlay: 0,
        votesWontPlay: 0,
        createdAt: now,
        date: new Date(now).toISOString()
    };

    posts.push(newPost);
    writeData(POSTS_FILE, posts);

    res.status(201).json(newPost);
});

app.post("/api/posts/:id/vote", (req, res) => {
    const { id } = req.params;
    const { type } = req.body;

    if (type !== "willPlay" && type !== "wontPlay") {
        return res.status(400).json({
            error: "Недопустимый тип голоса"
        });
    }

    const posts = readData(POSTS_FILE);
    const postIndex = posts.findIndex(
        (post) => String(post.id) === String(id)
    );

    if (postIndex === -1) {
        return res.status(404).json({
            error: "Пост не найден"
        });
    }

    const post = posts[postIndex];

    if (typeof post.votesWillPlay !== "number") {
        post.votesWillPlay = 0;
    }

    if (typeof post.votesWontPlay !== "number") {
        post.votesWontPlay = 0;
    }

    if (type === "willPlay") {
        post.votesWillPlay += 1;
    } else {
        post.votesWontPlay += 1;
    }

    posts[postIndex] = post;
    writeData(POSTS_FILE, posts);

    res.status(200).json(post);
});

app.delete("/api/posts/:id", (req, res) => {
    const { id } = req.params;
    const password =
        req.body?.password ||
        req.get("x-admin-password");

    if (!isAdmin(password)) {
        return res.status(401).json({
            error: "Ошибка доступа"
        });
    }

    const posts = readData(POSTS_FILE);
    const updatedPosts = posts.filter(
        (post) => String(post.id) !== String(id)
    );

    if (updatedPosts.length === posts.length) {
        return res.status(404).json({
            error: "Пост не найден"
        });
    }

    writeData(POSTS_FILE, updatedPosts);

    res.status(200).json({
        success: true,
        message: "Пост успешно удалён"
    });
});

/* =========================
   RELEASES API
========================= */

app.get("/api/releases", (req, res) => {
    const releases = readData(RELEASES_FILE);

    const sortedReleases = [...releases].sort((a, b) => {
        const aDate = new Date(a.releaseDate).getTime() || 0;
        const bDate = new Date(b.releaseDate).getTime() || 0;

        return aDate - bDate;
    });

    res.json(sortedReleases);
});

app.post("/api/releases", (req, res) => {
    const {
        title,
        releaseDate,
        password
    } = req.body;

    if (!isAdmin(password)) {
        return res.status(401).json({
            error: "Ошибка доступа"
        });
    }

    if (
        typeof title !== "string" ||
        typeof releaseDate !== "string" ||
        !title.trim() ||
        !releaseDate.trim()
    ) {
        return res.status(400).json({
            error: "Необходимо указать название игры и дату релиза"
        });
    }

    const parsedDate = new Date(releaseDate);

    if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
            error: "Некорректная дата релиза"
        });
    }

    const releases = readData(RELEASES_FILE);
    const now = Date.now();

    const newRelease = {
        id: now.toString(),
        title: title.trim(),
        releaseDate: releaseDate.trim(),
        createdAt: now
    };

    releases.push(newRelease);
    writeData(RELEASES_FILE, releases);

    res.status(201).json(newRelease);
});

app.delete("/api/releases/:id", (req, res) => {
    const { id } = req.params;
    const password =
        req.body?.password ||
        req.get("x-admin-password");

    if (!isAdmin(password)) {
        return res.status(401).json({
            error: "Ошибка доступа"
        });
    }

    const releases = readData(RELEASES_FILE);
    const updatedReleases = releases.filter(
        (release) => String(release.id) !== String(id)
    );

    if (updatedReleases.length === releases.length) {
        return res.status(404).json({
            error: "Релиз не найден"
        });
    }

    writeData(RELEASES_FILE, updatedReleases);

    res.status(200).json({
        success: true,
        message: "Релиз успешно удалён"
    });
});

app.listen(PORT, () => {
    console.log(`PlayPC server is running on port ${PORT}`);
});