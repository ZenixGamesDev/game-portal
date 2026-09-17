const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const POSTS_FILE = path.join(__dirname, "posts.json");
const RELEASES_FILE = path.join(__dirname, "releases.json");
const CONFIG_FILE = path.join(__dirname, "config.json");
const QUIZ_FILE = path.join(__dirname, "quiz.json");
const POLL_FILE = path.join(__dirname, "poll.json");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(PUBLIC_DIR));

const DEFAULT_CONFIG = {
    password: "AdminPlayPC2026",
    siteName: "PlayPC",
    footerText:
        "Юридическая информация • Сентябрь 2026\n" +
        "PlayPC в рамках функций данного интерфейса не использует cookies и не собирает персональные данные пользователей. " +
        "Данные не передаются третьим лицам через пользовательский интерфейс сайта. " +
        "Эксплуатация проекта должна осуществляться с учётом применимого законодательства Российской Федерации и Азербайджанской Республики.",
    musicPlaylist: []
};

const DEFAULT_POLL = {
    question: "Какую игру вы ждёте больше всего?",
    options: [
        { id: "option-1", text: "Grand Theft Auto VI", votes: 0 },
        { id: "option-2", text: "Resident Evil Requiem", votes: 0 },
        { id: "option-3", text: "The Witcher 4", votes: 0 },
        { id: "option-4", text: "Другое", votes: 0 }
    ]
};

const DEFAULT_QUIZ = {
    question: "Угадайте игру по описанию",
    description: "Создатели предлагают огромный открытый мир и кинематографичный сюжет.",
    options: [
        "Grand Theft Auto V",
        "The Last of Us",
        "Red Dead Redemption 2",
        "Minecraft"
    ],
    answer: 2
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function ensureJsonFile(file, defaultValue) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(
            file,
            JSON.stringify(defaultValue, null, 2),
            "utf8"
        );
        return;
    }

    try {
        const raw = fs.readFileSync(file, "utf8").trim();

        if (!raw) {
            fs.writeFileSync(
                file,
                JSON.stringify(defaultValue, null, 2),
                "utf8"
            );
            return;
        }

        JSON.parse(raw);
    } catch (error) {
        fs.writeFileSync(
            file,
            JSON.stringify(defaultValue, null, 2),
            "utf8"
        );
    }
}

function ensureFiles() {
    ensureJsonFile(POSTS_FILE, []);
    ensureJsonFile(RELEASES_FILE, []);
    ensureJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
    ensureJsonFile(QUIZ_FILE, DEFAULT_QUIZ);
    ensureJsonFile(POLL_FILE, DEFAULT_POLL);

    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

        let changed = false;

        if (!config || typeof config !== "object") {
            throw new Error("Invalid config");
        }

        if (typeof config.password !== "string" || !config.password.trim()) {
            config.password = DEFAULT_CONFIG.password;
            changed = true;
        }

        if (typeof config.siteName !== "string") {
            config.siteName = DEFAULT_CONFIG.siteName;
            changed = true;
        }

        if (typeof config.footerText !== "string") {
            config.footerText = DEFAULT_CONFIG.footerText;
            changed = true;
        }

        if (!Array.isArray(config.musicPlaylist)) {
            config.musicPlaylist = [];
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(
                CONFIG_FILE,
                JSON.stringify(config, null, 2),
                "utf8"
            );
        }
    } catch (error) {
        fs.writeFileSync(
            CONFIG_FILE,
            JSON.stringify(DEFAULT_CONFIG, null, 2),
            "utf8"
        );
    }
}

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 2),
                "utf8"
            );
            return clone(fallback);
        }

        const raw = fs.readFileSync(file, "utf8").trim();

        if (!raw) {
            return clone(fallback);
        }

        return JSON.parse(raw);
    } catch (error) {
        return clone(fallback);
    }
}

function writeJson(file, data) {
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

function getConfig() {
    const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

    if (
        !config ||
        typeof config !== "object" ||
        Array.isArray(config)
    ) {
        writeJson(CONFIG_FILE, DEFAULT_CONFIG);
        return clone(DEFAULT_CONFIG);
    }

    let changed = false;

    if (typeof config.password !== "string" || !config.password.trim()) {
        config.password = DEFAULT_CONFIG.password;
        changed = true;
    }

    if (typeof config.siteName !== "string") {
        config.siteName = DEFAULT_CONFIG.siteName;
        changed = true;
    }

    if (typeof config.footerText !== "string") {
        config.footerText = DEFAULT_CONFIG.footerText;
        changed = true;
    }

    if (!Array.isArray(config.musicPlaylist)) {
        config.musicPlaylist = [];
        changed = true;
    }

    if (changed) {
        writeJson(CONFIG_FILE, config);
    }

    return config;
}

function getAdminPassword() {
    const config = getConfig();
    return config.password;
}

function extractPassword(req) {
    const bodyPassword =
        req.body &&
        typeof req.body.password === "string"
            ? req.body.password
            : "";

    const headerPassword =
        typeof req.headers["x-admin-password"] === "string"
            ? req.headers["x-admin-password"]
            : "";

    const authorization =
        typeof req.headers.authorization === "string"
            ? req.headers.authorization
            : "";

    const bearerPassword = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

    const queryPassword =
        typeof req.query.password === "string"
            ? req.query.password
            : "";

    return (
        bodyPassword ||
        headerPassword ||
        bearerPassword ||
        queryPassword ||
        ""
    );
}

function isAdmin(req) {
    const suppliedPassword = extractPassword(req);
    const currentPassword = getAdminPassword();

    return (
        typeof suppliedPassword === "string" &&
        suppliedPassword === currentPassword
    );
}

function requireAdmin(req, res, next) {
    if (!isAdmin(req)) {
        return res.status(401).json({
            success: false,
            error: "Неверный пароль администратора."
        });
    }

    next();
}

function generateId(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

function normalizePlatform(platform) {
    if (typeof platform !== "string") {
        return "PC";
    }

    const value = platform.trim();

    if (value === "PlayStation") {
        return "PlayStation";
    }

    if (value === "PC / PlayStation") {
        return "PC / PlayStation";
    }

    return "PC";
}

function normalizeMoodTag(tag) {
    if (typeof tag !== "string") {
        return "";
    }

    const value = tag.trim();

    const allowed = [
        "🔥 Официально",
        "👀 Слух",
        "⚡ Инсайд",
        "📝 Мнение"
    ];

    return allowed.includes(value) ? value : "";
}

function normalizePost(post, existing = null) {
    const source = post && typeof post === "object" ? post : {};

    const result = existing
        ? { ...existing }
        : {};

    if (!result.id) {
        result.id = source.id || generateId("post");
    }

    result.title =
        typeof source.title === "string"
            ? source.title.trim()
            : typeof result.title === "string"
                ? result.title
                : "";

    result.content =
        typeof source.content === "string"
            ? source.content
            : typeof result.content === "string"
                ? result.content
                : "";

    result.image =
        typeof source.image === "string"
            ? source.image
            : typeof result.image === "string"
                ? result.image
                : "";

    result.platform = normalizePlatform(
        source.platform !== undefined
            ? source.platform
            : result.platform
    );

    result.moodTag = normalizeMoodTag(
        source.moodTag !== undefined
            ? source.moodTag
            : result.moodTag
    );

    result.category =
        typeof source.category === "string"
            ? source.category
            : typeof result.category === "string"
                ? result.category
                : "";

    result.author =
        typeof source.author === "string"
            ? source.author
            : typeof result.author === "string"
                ? result.author
                : "PlayPC";

    result.status =
        source.status === "draft" ||
        source.status === "scheduled" ||
        source.status === "archived"
            ? source.status
            : result.status || "published";

    result.scheduledAt =
        source.scheduledAt !== undefined
            ? source.scheduledAt
            : result.scheduledAt || null;

    result.pinned =
        source.pinned !== undefined
            ? Boolean(source.pinned)
            : Boolean(result.pinned);

    result.createdAt =
        source.createdAt ||
        result.createdAt ||
        new Date().toISOString();

    result.updatedAt = new Date().toISOString();

    result.publishedAt =
        source.publishedAt !== undefined
            ? source.publishedAt
            : result.publishedAt || null;

    result.analytics = {
        ...(existing && existing.analytics
            ? existing.analytics
            : {}),
        ...(source.analytics && typeof source.analytics === "object"
            ? source.analytics
            : {})
    };

    const analyticsKeys = [
        "views",
        "shares",
        "bookmarks",
        "likes",
        "dislikes"
    ];

    for (const key of analyticsKeys) {
        const value = Number(result.analytics[key]);
        result.analytics[key] =
            Number.isFinite(value) && value >= 0
                ? Math.floor(value)
                : 0;
    }

    return result;
}

function normalizeRelease(release, existing = null) {
    const source =
        release && typeof release === "object"
            ? release
            : {};

    const result = existing
        ? { ...existing }
        : {};

    if (!result.id) {
        result.id = source.id || generateId("release");
    }

    result.title =
        typeof source.title === "string"
            ? source.title.trim()
            : result.title || "";

    result.description =
        typeof source.description === "string"
            ? source.description
            : result.description || "";

    result.image =
        typeof source.image === "string"
            ? source.image
            : result.image || "";

    result.platform =
        typeof source.platform === "string"
            ? source.platform
            : result.platform || "PC";

    result.releaseDate =
        source.releaseDate !== undefined
            ? source.releaseDate
            : result.releaseDate || null;

    result.releaseTime =
        source.releaseTime !== undefined
            ? source.releaseTime
            : result.releaseTime || "00:00:00";

    result.price =
        source.price !== undefined
            ? source.price
            : result.price ?? "";

    result.currency =
        typeof source.currency === "string"
            ? source.currency
            : result.currency || "USD";

    result.developer =
        typeof source.developer === "string"
            ? source.developer
            : result.developer || "";

    result.genre =
        typeof source.genre === "string"
            ? source.genre
            : result.genre || "";

    result.archived =
        source.archived !== undefined
            ? Boolean(source.archived)
            : Boolean(result.archived);

    result.createdAt =
        source.createdAt ||
        result.createdAt ||
        new Date().toISOString();

    result.updatedAt = new Date().toISOString();

    result.votes = {
        waiting:
            Number(
                source.votes &&
                source.votes.waiting !== undefined
                    ? source.votes.waiting
                    : result.votes &&
                      result.votes.waiting
            ) || 0,
        skipped:
            Number(
                source.votes &&
                source.votes.skipped !== undefined
                    ? source.votes.skipped
                    : result.votes &&
                      result.votes.skipped
            ) || 0
    };

    return result;
}

ensureFiles();

/* =========================================================
   PUBLIC CONFIG
   ========================================================= */

app.get("/api/config", (req, res) => {
    const config = getConfig();

    res.json({
        siteName: config.siteName,
        footerText: config.footerText,
        musicPlaylist: Array.isArray(config.musicPlaylist)
            ? config.musicPlaylist
            : []
    });
});

/* =========================================================
   ADMIN LOGIN
   ========================================================= */

app.post("/api/admin/login", (req, res) => {
    const password =
        req.body && typeof req.body.password === "string"
            ? req.body.password
            : "";

    if (password !== getAdminPassword()) {
        return res.status(401).json({
            success: false,
            error: "Неверный пароль."
        });
    }

    return res.json({
        success: true,
        token: "authenticated"
    });
});

/* =========================================================
   POSTS
   ========================================================= */

app.get("/api/posts", (req, res) => {
    const posts = readJson(POSTS_FILE, []);

    const now = Date.now();

    const normalizedPosts = Array.isArray(posts)
        ? posts.map((post) => {
            const item = normalizePost(post);

            if (
                item.status === "scheduled" &&
                item.scheduledAt
            ) {
                const scheduledTime =
                    new Date(item.scheduledAt).getTime();

                if (
                    Number.isFinite(scheduledTime) &&
                    scheduledTime <= now
                ) {
                    item.status = "published";
                    item.publishedAt =
                        item.publishedAt ||
                        item.scheduledAt;
                }
            }

            return item;
        })
        : [];

    if (
        JSON.stringify(normalizedPosts) !==
        JSON.stringify(posts)
    ) {
        writeJson(POSTS_FILE, normalizedPosts);
    }

    res.json(normalizedPosts);
});

app.post("/api/posts", requireAdmin, async (req, res) => {
    try {
        const posts = readJson(POSTS_FILE, []);

        const source = req.body || {};

        const post = normalizePost({
            ...source,
            id: source.id || generateId("post"),
            platform: normalizePlatform(source.platform),
            moodTag: normalizeMoodTag(source.moodTag),
            createdAt:
                source.createdAt ||
                new Date().toISOString()
        });

        posts.unshift(post);

        writeJson(POSTS_FILE, posts);

        await syncWithGitHub();

        res.status(201).json({
            success: true,
            post
        });
    } catch (error) {
        console.error("POST /api/posts:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось создать новость."
        });
    }
});

app.put("/api/posts/:id", requireAdmin, async (req, res) => {
    try {
        const posts = readJson(POSTS_FILE, []);

        const index = posts.findIndex(
            (post) => String(post.id) === String(req.params.id)
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Новость не найдена."
            });
        }

        const oldPost = posts[index];

        const updatedPost = normalizePost(
            {
                ...req.body,
                id: oldPost.id,
                createdAt:
                    req.body.createdAt ||
                    oldPost.createdAt
            },
            oldPost
        );

        posts[index] = updatedPost;

        writeJson(POSTS_FILE, posts);

        await syncWithGitHub();

        res.json({
            success: true,
            post: updatedPost
        });
    } catch (error) {
        console.error("PUT /api/posts/:id:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось обновить новость."
        });
    }
});

app.delete("/api/posts/:id", requireAdmin, async (req, res) => {
    try {
        const posts = readJson(POSTS_FILE, []);

        const index = posts.findIndex(
            (post) => String(post.id) === String(req.params.id)
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Новость не найдена."
            });
        }

        const deleted = posts.splice(index, 1)[0];

        writeJson(POSTS_FILE, posts);

        await syncWithGitHub();

        res.json({
            success: true,
            post: deleted
        });
    } catch (error) {
        console.error("DELETE /api/posts/:id:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось удалить новость."
        });
    }
});

app.post("/api/posts/:id/click", async (req, res) => {
    try {
        const posts = readJson(POSTS_FILE, []);

        const index = posts.findIndex(
            (post) => String(post.id) === String(req.params.id)
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Новость не найдена."
            });
        }

        const type =
            req.body &&
            typeof req.body.type === "string"
                ? req.body.type.trim().toLowerCase()
                : "";

        const supportedTypes = [
            "share",
            "bookmark",
            "like",
            "dislike"
        ];

        if (!supportedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                error: "Неизвестный тип аналитики."
            });
        }

        const post = normalizePost(posts[index]);

        if (!post.analytics) {
            post.analytics = {};
        }

        if (type === "share") {
            post.analytics.shares += 1;
        } else if (type === "bookmark") {
            post.analytics.bookmarks += 1;
        } else if (type === "like") {
            post.analytics.likes += 1;
        } else if (type === "dislike") {
            post.analytics.dislikes += 1;
        }

        post.updatedAt = new Date().toISOString();

        posts[index] = post;

        writeJson(POSTS_FILE, posts);

        res.json({
            success: true,
            analytics: post.analytics
        });
    } catch (error) {
        console.error("POST /api/posts/:id/click:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось сохранить аналитику."
        });
    }
});

/* =========================================================
   RELEASES
   ========================================================= */

app.get("/api/releases", (req, res) => {
    const releases = readJson(RELEASES_FILE, []);

    const active = Array.isArray(releases)
        ? releases
            .map((release) => normalizeRelease(release))
            .filter((release) => !release.archived)
        : [];

    res.json(active);
});

app.get(
    "/api/releases/archive",
    requireAdmin,
    (req, res) => {
        const releases = readJson(RELEASES_FILE, []);

        const archive = Array.isArray(releases)
            ? releases
                .map((release) => normalizeRelease(release))
                .filter((release) => release.archived)
            : [];

        res.json(archive);
    }
);

app.post("/api/releases", requireAdmin, async (req, res) => {
    try {
        const releases = readJson(RELEASES_FILE, []);

        const release = normalizeRelease({
            ...req.body,
            id: req.body.id || generateId("release")
        });

        releases.unshift(release);

        writeJson(RELEASES_FILE, releases);

        await syncWithGitHub();

        res.status(201).json({
            success: true,
            release
        });
    } catch (error) {
        console.error("POST /api/releases:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось создать релиз."
        });
    }
});

app.patch(
    "/api/releases/:id/archive",
    requireAdmin,
    async (req, res) => {
        try {
            const releases = readJson(RELEASES_FILE, []);

            const index = releases.findIndex(
                (release) =>
                    String(release.id) ===
                    String(req.params.id)
            );

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: "Релиз не найден."
                });
            }

            releases[index] = normalizeRelease(
                {
                    ...releases[index],
                    archived:
                        req.body &&
                        req.body.archived !== undefined
                            ? Boolean(req.body.archived)
                            : true
                },
                releases[index]
            );

            writeJson(RELEASES_FILE, releases);

            await syncWithGitHub();

            res.json({
                success: true,
                release: releases[index]
            });
        } catch (error) {
            console.error(
                "PATCH /api/releases/:id/archive:",
                error
            );

            res.status(500).json({
                success: false,
                error: "Не удалось изменить архивный статус."
            });
        }
    }
);

app.delete(
    "/api/releases/:id",
    requireAdmin,
    async (req, res) => {
        try {
            const releases = readJson(RELEASES_FILE, []);

            const index = releases.findIndex(
                (release) =>
                    String(release.id) ===
                    String(req.params.id)
            );

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: "Релиз не найден."
                });
            }

            const deleted = releases.splice(index, 1)[0];

            writeJson(RELEASES_FILE, releases);

            await syncWithGitHub();

            res.json({
                success: true,
                release: deleted
            });
        } catch (error) {
            console.error(
                "DELETE /api/releases/:id:",
                error
            );

            res.status(500).json({
                success: false,
                error: "Не удалось удалить релиз."
            });
        }
    }
);

app.post(
    "/api/releases/:id/vote",
    async (req, res) => {
        try {
            const releases = readJson(RELEASES_FILE, []);

            const index = releases.findIndex(
                (release) =>
                    String(release.id) ===
                    String(req.params.id)
            );

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: "Релиз не найден."
                });
            }

            const type =
                req.body &&
                typeof req.body.type === "string"
                    ? req.body.type.trim().toLowerCase()
                    : "";

            if (
                type !== "waiting" &&
                type !== "wait" &&
                type !== "skipped" &&
                type !== "skip"
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Неизвестный вариант голосования."
                });
            }

            const release = normalizeRelease(releases[index]);

            if (type === "waiting" || type === "wait") {
                release.votes.waiting += 1;
            } else {
                release.votes.skipped += 1;
            }

            release.updatedAt = new Date().toISOString();

            releases[index] = release;

            writeJson(RELEASES_FILE, releases);

            res.json({
                success: true,
                votes: release.votes
            });
        } catch (error) {
            console.error(
                "POST /api/releases/:id/vote:",
                error
            );

            res.status(500).json({
                success: false,
                error: "Не удалось сохранить голос."
            });
        }
    }
);

/* =========================================================
   MUSIC
   ========================================================= */

app.get("/api/music", (req, res) => {
    const config = getConfig();

    res.json(
        Array.isArray(config.musicPlaylist)
            ? config.musicPlaylist
            : []
    );
});

app.post("/api/music/manage", requireAdmin, async (req, res) => {
    try {
        const config = getConfig();

        if (!Array.isArray(config.musicPlaylist)) {
            config.musicPlaylist = [];
        }

        const track = req.body || {};

        if (
            !track.title ||
            typeof track.title !== "string"
        ) {
            return res.status(400).json({
                success: false,
                error: "Укажите название трека."
            });
        }

        if (
            !track.data &&
            !track.src &&
            !track.audio
        ) {
            return res.status(400).json({
                success: false,
                error: "Не найден Base64-аудиофайл."
            });
        }

        const newTrack = {
            id: track.id || generateId("track"),
            title: track.title.trim(),
            artist:
                typeof track.artist === "string"
                    ? track.artist.trim()
                    : "PlayPC",
            data:
                track.data ||
                track.src ||
                track.audio,
            type:
                typeof track.type === "string"
                    ? track.type
                    : "audio/mpeg",
            createdAt:
                track.createdAt ||
                new Date().toISOString()
        };

        config.musicPlaylist.push(newTrack);

        writeJson(CONFIG_FILE, config);

        await syncWithGitHub();

        res.status(201).json({
            success: true,
            track: newTrack,
            musicPlaylist: config.musicPlaylist
        });
    } catch (error) {
        console.error("POST /api/music/manage:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось сохранить трек."
        });
    }
});

app.delete(
    "/api/admin/music/:id",
    requireAdmin,
    async (req, res) => {
        try {
            const config = getConfig();

            if (!Array.isArray(config.musicPlaylist)) {
                config.musicPlaylist = [];
            }

            const index = config.musicPlaylist.findIndex(
                (track) =>
                    String(track.id) ===
                    String(req.params.id)
            );

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: "Трек не найден."
                });
            }

            const deleted =
                config.musicPlaylist.splice(index, 1)[0];

            writeJson(CONFIG_FILE, config);

            await syncWithGitHub();

            res.json({
                success: true,
                track: deleted,
                musicPlaylist: config.musicPlaylist
            });
        } catch (error) {
            console.error(
                "DELETE /api/admin/music/:id:",
                error
            );

            res.status(500).json({
                success: false,
                error: "Не удалось удалить трек."
            });
        }
    }
);

/* =========================================================
   DYNAMIC ADMIN CONFIG
   ========================================================= */

app.post(
    "/api/admin/config",
    requireAdmin,
    async (req, res) => {
        try {
            const config = getConfig();

            const currentPassword =
                typeof req.body.currentPassword === "string"
                    ? req.body.currentPassword
                    : typeof req.body.password === "string"
                        ? req.body.password
                        : "";

            if (currentPassword !== config.password) {
                return res.status(401).json({
                    success: false,
                    error: "Текущий пароль администратора указан неверно."
                });
            }

            if (
                req.body.siteName !== undefined &&
                typeof req.body.siteName === "string"
            ) {
                const siteName = req.body.siteName.trim();

                if (siteName) {
                    config.siteName = siteName;
                }
            }

            if (
                req.body.footerText !== undefined &&
                typeof req.body.footerText === "string"
            ) {
                config.footerText = req.body.footerText;
            }

            if (
                typeof req.body.newPassword === "string" &&
                req.body.newPassword.trim()
            ) {
                config.password = req.body.newPassword.trim();
            }

            if (!Array.isArray(config.musicPlaylist)) {
                config.musicPlaylist = [];
            }

            writeJson(CONFIG_FILE, config);

            await syncWithGitHub();

            res.json({
                success: true,
                siteName: config.siteName,
                footerText: config.footerText,
                passwordChanged:
                    typeof req.body.newPassword === "string" &&
                    Boolean(req.body.newPassword.trim()),
                musicPlaylist: config.musicPlaylist
            });
        } catch (error) {
            console.error(
                "POST /api/admin/config:",
                error
            );

            res.status(500).json({
                success: false,
                error: "Не удалось сохранить настройки."
            });
        }
    }
);

/* =========================================================
   CLEAR ALL DATA
   ========================================================= */

app.post(
    "/api/admin/clear-all",
    requireAdmin,
    async (req, res) => {
        try {
            writeJson(POSTS_FILE, []);
            writeJson(RELEASES_FILE, []);

            const config = getConfig();
            config.musicPlaylist = [];
            writeJson(CONFIG_FILE, config);

            writeJson(POLL_FILE, clone(DEFAULT_POLL));
            writeJson(QUIZ_FILE, clone(DEFAULT_QUIZ));

            await syncWithGitHub();

            res.json({
                success: true
            });
        } catch (error) {
            console.error(
                "POST /api/admin/clear-all:",
                error
            );

            res.status(500).json({
                success: false,
                error: "Не удалось очистить данные."
            });
        }
    }
);

/* =========================================================
   POLL
   ========================================================= */

app.get("/api/poll", (req, res) => {
    const poll = readJson(POLL_FILE, DEFAULT_POLL);

    res.json(poll);
});

app.post("/api/poll/vote", async (req, res) => {
    try {
        const poll = readJson(POLL_FILE, DEFAULT_POLL);

        if (!Array.isArray(poll.options)) {
            poll.options = [];
        }

        const optionId =
            req.body &&
            typeof req.body.optionId === "string"
                ? req.body.optionId
                : req.body &&
                  typeof req.body.id === "string"
                    ? req.body.id
                    : "";

        const optionIndex = poll.options.findIndex(
            (option) =>
                String(option.id) === String(optionId)
        );

        if (optionIndex === -1) {
            return res.status(404).json({
                success: false,
                error: "Вариант ответа не найден."
            });
        }

        const currentVotes =
            Number(poll.options[optionIndex].votes) || 0;

        poll.options[optionIndex].votes =
            currentVotes + 1;

        writeJson(POLL_FILE, poll);

        res.json({
            success: true,
            poll
        });
    } catch (error) {
        console.error("POST /api/poll/vote:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось сохранить голос."
        });
    }
});

app.post(
    "/api/poll/manage",
    requireAdmin,
    async (req, res) => {
        try {
            const body = req.body || {};

            const question =
                typeof body.question === "string"
                    ? body.question.trim()
                    : "";

            const incomingOptions = Array.isArray(body.options)
                ? body.options
                : [];

            const options = incomingOptions
                .map((option, index) => {
                    if (typeof option === "string") {
                        return {
                            id: `option-${index + 1}`,
                            text: option.trim(),
                            votes: 0
                        };
                    }

                    if (
                        option &&
                        typeof option === "object"
                    ) {
                        return {
                            id:
                                option.id ||
                                `option-${index + 1}`,
                            text:
                                typeof option.text === "string"
                                    ? option.text.trim()
                                    : "",
                            votes:
                                Number(option.votes) || 0
                        };
                    }

                    return null;
                })
                .filter(
                    (option) =>
                        option &&
                        typeof option.text === "string" &&
                        option.text
                );

            const poll = {
                question:
                    question ||
                    DEFAULT_POLL.question,
                options:
                    options.length > 0
                        ? options
                        : clone(DEFAULT_POLL.options),
                updatedAt: new Date().toISOString()
            };

            writeJson(POLL_FILE, poll);

            await syncWithGitHub();

            res.json({
                success: true,
                poll
            });
        } catch (error) {
            console.error(
                "POST /api/poll/manage:",
                error
            );

            res.status(500).json({
                success: false,
                error: "Не удалось сохранить опрос."
            });
        }
    }
);

/* =========================================================
   QUIZ
   ========================================================= */

app.get("/api/quiz", (req, res) => {
    const quiz = readJson(QUIZ_FILE, DEFAULT_QUIZ);

    res.json(quiz);
});

app.post("/api/quiz/answer", async (req, res) => {
    try {
        const quiz = readJson(QUIZ_FILE, DEFAULT_QUIZ);

        const rawAnswer =
            req.body &&
            req.body.answer !== undefined
                ? req.body.answer
                : req.body &&
                  req.body.index !== undefined
                    ? req.body.index
                    : null;

        const numericAnswer = Number(rawAnswer);
        const correctAnswer = Number(quiz.answer);

        const correct =
            Number.isFinite(numericAnswer) &&
            Number.isFinite(correctAnswer) &&
            numericAnswer === correctAnswer;

        res.json({
            success: true,
            correct,
            answer: correctAnswer
        });
    } catch (error) {
        console.error("POST /api/quiz/answer:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось проверить ответ."
        });
    }
});

app.post(
    "/api/quiz/manage",
    requireAdmin,
    async (req, res) => {
        try {
            const body = req.body || {};

            const quiz = {
                question:
                    typeof body.question === "string"
                        ? body.question
                        : DEFAULT_QUIZ.question,

                description:
                    typeof body.description === "string"
                        ? body.description
                        : DEFAULT_QUIZ.description,

                options:
                    Array.isArray(body.options)
                        ? body.options.map((option) =>
                            typeof option === "string"
                                ? option
                                : String(option ?? "")
                        )
                        : clone(DEFAULT_QUIZ.options),

                answer:
                    Number.isFinite(Number(body.answer))
                        ? Number(body.answer)
                        : DEFAULT_QUIZ.answer,

                updatedAt: new Date().toISOString()
            };

            writeJson(QUIZ_FILE, quiz);

            await syncWithGitHub();

            res.json({
                success: true,
                quiz
            });
        } catch (error) {
            console.error(
                "POST /api/quiz/manage:",
                error
            );

            res.status(500).json({
                success: false,
                error: "Не удалось сохранить викторину."
            });
        }
    }
);

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "online",
        siteName: getConfig().siteName,
        time: new Date().toISOString()
    });
});

/* =========================================================
   GITHUB SYNC
   ========================================================= */

function syncWithGitHub() {
    return new Promise((resolve) => {
        const filesToSync = [
            "posts.json",
            "releases.json",
            "config.json",
            "quiz.json",
            "poll.json"
        ];

        const command =
            `git add ${filesToSync.join(" ")} && ` +
            `git diff --cached --quiet || ` +
            `git commit -m "PlayPC automatic data sync ${new Date().toISOString()}" && ` +
            `git push`;

        exec(
            command,
            {
                cwd: __dirname,
                maxBuffer: 1024 * 1024 * 10
            },
            (error, stdout, stderr) => {
                if (error) {
                    console.log(
                        "GitHub sync skipped/failed:",
                        stderr || error.message
                    );
                    resolve(false);
                    return;
                }

                console.log(
                    "GitHub sync completed:",
                    stdout || "OK"
                );

                resolve(true);
            }
        );
    });
}

/* =========================================================
   404 / FRONTEND FALLBACK
   ========================================================= */

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            error: "API endpoint not found."
        });
    }

    const indexFile = path.join(
        PUBLIC_DIR,
        "index.html"
    );

    if (fs.existsSync(indexFile)) {
        return res.sendFile(indexFile);
    }

    return res.status(404).send("PlayPC");
});

/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use((error, req, res, next) => {
    console.error("Server error:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Внутренняя ошибка сервера."
    });
});

/* =========================================================
   START SERVER
   ========================================================= */

app.listen(PORT, () => {
    ensureFiles();

    console.log("========================================");
    console.log("          PLAYPC SERVER ONLINE");
    console.log("========================================");
    console.log(`Port: ${PORT}`);
    console.log(`Site: ${getConfig().siteName}`);
    console.log(`Public: ${PUBLIC_DIR}`);
    console.log("Dynamic admin configuration: ENABLED");
    console.log("Multiplatform news: ENABLED");
    console.log("GitHub synchronization: ENABLED");
    console.log("========================================");
});