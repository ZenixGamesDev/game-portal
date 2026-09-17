const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const CONFIG_FILE = path.join(ROOT_DIR, "config.json");
const POSTS_FILE = path.join(ROOT_DIR, "posts.json");
const RELEASES_FILE = path.join(ROOT_DIR, "releases.json");
const QUIZ_FILE = path.join(ROOT_DIR, "quiz.json");
const POLL_FILE = path.join(ROOT_DIR, "poll.json");

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
    options: ["Grand Theft Auto VI", "The Last of Us", "Uncharted", "Far Cry"],
    votes: [0, 0, 0, 0],
    totalVotes: 0
};

const DEFAULT_QUIZ = {
    question: "Из какой серии эта игра?",
    image: "",
    options: ["Uncharted", "Far Cry", "The Last of Us", "Assassin's Creed"],
    correctIndex: 0
};

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(PUBLIC_DIR));

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
    }
}

function ensureFiles() {
    ensureJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
    ensureJsonFile(POSTS_FILE, []);
    ensureJsonFile(RELEASES_FILE, []);
    ensureJsonFile(QUIZ_FILE, DEFAULT_QUIZ);
    ensureJsonFile(POLL_FILE, DEFAULT_POLL);

    try {
        const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

        let changed = false;

        if (!config || typeof config !== "object") {
            fs.writeFileSync(
                CONFIG_FILE,
                JSON.stringify(DEFAULT_CONFIG, null, 2),
                "utf8"
            );
            return;
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
            return clone(fallback);
        }

        const raw = fs.readFileSync(file, "utf8");

        if (!raw.trim()) {
            return clone(fallback);
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(`Ошибка чтения ${path.basename(file)}:`, error.message);
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
    ensureFiles();

    const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

    if (!config || typeof config !== "object") {
        return clone(DEFAULT_CONFIG);
    }

    if (!Array.isArray(config.musicPlaylist)) {
        config.musicPlaylist = [];
    }

    return config;
}

function getAdminPassword() {
    const config = getConfig();
    return typeof config.password === "string"
        ? config.password
        : DEFAULT_CONFIG.password;
}

function extractPassword(req) {
    const bodyPassword =
        req.body && typeof req.body.password === "string"
            ? req.body.password
            : "";

    const headerPassword =
        typeof req.headers["x-admin-password"] === "string"
            ? req.headers["x-admin-password"]
            : "";

    const queryPassword =
        typeof req.query.password === "string"
            ? req.query.password
            : "";

    return bodyPassword || headerPassword || queryPassword;
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
            error: "Сервер отклонил пароль"
        });
    }

    next();
}

function publicConfig() {
    const config = getConfig();

    return {
        siteName: config.siteName,
        footerText: config.footerText,
        musicPlaylist: Array.isArray(config.musicPlaylist)
            ? config.musicPlaylist
            : []
    };
}

function createId(prefix = "item") {
    return `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

function normalizeAnalytics(item) {
    if (!item.analytics || typeof item.analytics !== "object") {
        item.analytics = {};
    }

    const keys = [
        "likes",
        "dislikes",
        "shares",
        "bookmarks",
        "clicks"
    ];

    for (const key of keys) {
        const value = Number(item.analytics[key]);
        item.analytics[key] = Number.isFinite(value) && value >= 0
            ? value
            : 0;
    }

    return item;
}

function parseDate(value) {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function isPublishedPost(post) {
    if (post.isDraft === true) {
        return false;
    }

    const publishAt = parseDate(post.publishAt);

    if (publishAt && publishAt.getTime() > Date.now()) {
        return false;
    }

    return true;
}

function sanitizePostForPublic(post) {
    const copy = clone(post);

    normalizeAnalytics(copy);

    return copy;
}

function sanitizeReleaseForPublic(release) {
    return clone(release);
}

function sanitizeQuizForPublic(quiz) {
    const copy = clone(quiz);

    delete copy.correctIndex;

    return copy;
}

function normalizePoll(poll) {
    if (!poll || typeof poll !== "object") {
        poll = clone(DEFAULT_POLL);
    }

    if (typeof poll.question !== "string") {
        poll.question = DEFAULT_POLL.question;
    }

    if (!Array.isArray(poll.options)) {
        poll.options = clone(DEFAULT_POLL.options);
    }

    poll.options = poll.options.map((option) => {
        if (typeof option === "string") {
            return option;
        }

        if (option && typeof option === "object") {
            return String(
                option.text ??
                option.title ??
                option.label ??
                ""
            );
        }

        return String(option ?? "");
    });

    if (!Array.isArray(poll.votes)) {
        poll.votes = [];
    }

    while (poll.votes.length < poll.options.length) {
        poll.votes.push(0);
    }

    poll.votes = poll.options.map((_, index) => {
        const value = Number(poll.votes[index]);
        return Number.isFinite(value) && value >= 0 ? value : 0;
    });

    poll.totalVotes = poll.votes.reduce(
        (sum, value) => sum + value,
        0
    );

    return poll;
}

function normalizeQuiz(quiz) {
    if (!quiz || typeof quiz !== "object") {
        quiz = clone(DEFAULT_QUIZ);
    }

    if (typeof quiz.question !== "string") {
        quiz.question = DEFAULT_QUIZ.question;
    }

    if (typeof quiz.image !== "string") {
        quiz.image = "";
    }

    if (!Array.isArray(quiz.options)) {
        quiz.options = clone(DEFAULT_QUIZ.options);
    }

    quiz.options = quiz.options.map((option) => {
        if (typeof option === "string") {
            return option;
        }

        if (option && typeof option === "object") {
            return String(
                option.text ??
                option.title ??
                option.label ??
                ""
            );
        }

        return String(option ?? "");
    });

    while (quiz.options.length < 4) {
        quiz.options.push("");
    }

    quiz.options = quiz.options.slice(0, 4);

    const correctIndex = Number(quiz.correctIndex);

    quiz.correctIndex =
        Number.isInteger(correctIndex) &&
        correctIndex >= 0 &&
        correctIndex < quiz.options.length
            ? correctIndex
            : 0;

    return quiz;
}

function normalizeMusicItem(item, index) {
    if (typeof item === "string") {
        return {
            id: `music_${index}_${Date.now()}`,
            title: `Трек ${index + 1}`,
            mp3Data: item
        };
    }

    if (!item || typeof item !== "object") {
        return null;
    }

    return {
        id: String(item.id || createId("music")),
        title: String(item.title || `Трек ${index + 1}`),
        mp3Data: String(
            item.mp3Data ||
            item.data ||
            item.url ||
            ""
        )
    };
}

function normalizeMusicPlaylist(playlist) {
    if (!Array.isArray(playlist)) {
        return [];
    }

    return playlist
        .map(normalizeMusicItem)
        .filter(Boolean)
        .filter((item) => item.mp3Data);
}

function sanitizeMusicPlaylist(playlist) {
    return normalizeMusicPlaylist(playlist);
}

function runCommand(command) {
    return new Promise((resolve) => {
        exec(
            command,
            {
                cwd: ROOT_DIR,
                windowsHide: true,
                maxBuffer: 1024 * 1024
            },
            (error, stdout, stderr) => {
                if (error) {
                    console.error(
                        "GitHub sync error:",
                        error.message
                    );
                    if (stderr) {
                        console.error(stderr);
                    }
                    resolve(false);
                    return;
                }

                if (stdout) {
                    console.log(stdout.trim());
                }

                resolve(true);
            }
        );
    });
}

async function syncWithGitHub() {
    try {
        if (!fs.existsSync(path.join(ROOT_DIR, ".git"))) {
            console.log("Git-репозиторий не найден. Sync пропущен.");
            return false;
        }

        const addResult = await runCommand(
            "git add posts.json releases.json config.json quiz.json poll.json"
        );

        if (!addResult) {
            return false;
        }

        const status = await new Promise((resolve) => {
            exec(
                "git status --porcelain",
                {
                    cwd: ROOT_DIR,
                    windowsHide: true,
                    maxBuffer: 1024 * 1024
                },
                (error, stdout) => {
                    if (error) {
                        resolve("");
                        return;
                    }

                    resolve(stdout.trim());
                }
            );
        });

        if (!status) {
            return true;
        }

        const commitMessage =
            `PlayPC auto sync ${new Date().toISOString()}`;

        const commitResult = await runCommand(
            `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`
        );

        if (!commitResult) {
            return false;
        }

        return await runCommand("git push");
    } catch (error) {
        console.error(
            "Ошибка syncWithGitHub():",
            error.message
        );
        return false;
    }
}

async function syncAndRespond(res, payload = {}) {
    try {
        await syncWithGitHub();
    } catch (error) {
        console.error(error.message);
    }

    return res.json({
        success: true,
        ...payload
    });
}

ensureFiles();

/* =========================
   PUBLIC CONFIG
========================= */

app.get("/api/config", (req, res) => {
    return res.json(publicConfig());
});

/* =========================
   ADMIN LOGIN
========================= */

app.post("/api/admin/login", (req, res) => {
    const suppliedPassword =
        req.body && typeof req.body.password === "string"
            ? req.body.password
            : "";

    if (suppliedPassword !== getAdminPassword()) {
        return res.status(401).json({
            success: false,
            error: "Сервер отклонил пароль"
        });
    }

    return res.status(200).json({
        success: true,
        token: "authenticated"
    });
});

/* =========================
   POSTS
========================= */

app.get("/api/posts", (req, res) => {
    const posts = readJson(POSTS_FILE, []);

    const wantsAdmin =
        req.query.admin === "1" ||
        req.query.admin === "true" ||
        req.headers["x-admin-password"];

    if (wantsAdmin && isAdmin(req)) {
        return res.json(
            posts.map((post) => {
                normalizeAnalytics(post);
                return post;
            })
        );
    }

    const visiblePosts = posts
        .filter(isPublishedPost)
        .map(sanitizePostForPublic);

    return res.json(visiblePosts);
});

app.post("/api/posts", requireAdmin, async (req, res) => {
    const posts = readJson(POSTS_FILE, []);

    const body = req.body || {};

    const post = {
        id: String(body.id || createId("post")),
        title: String(body.title || "Без названия"),
        platform: String(body.platform || "PC"),
        imageUrl: String(body.imageUrl || ""),
        content: String(body.content || ""),
        moodTag: String(body.moodTag || "📝 Мнение"),
        publishAt: body.publishAt
            ? String(body.publishAt)
            : new Date().toISOString(),
        isDraft: body.isDraft === true,
        pinned: body.pinned === true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        analytics: {
            likes: 0,
            dislikes: 0,
            shares: 0,
            bookmarks: 0,
            clicks: 0
        }
    };

    normalizeAnalytics(post);

    posts.unshift(post);

    writeJson(POSTS_FILE, posts);

    return syncAndRespond(res, {
        post
    });
});

app.put("/api/posts/:id", requireAdmin, async (req, res) => {
    const posts = readJson(POSTS_FILE, []);

    const index = posts.findIndex(
        (post) => String(post.id) === String(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Пост не найден"
        });
    }

    const oldPost = posts[index];
    const body = req.body || {};

    const updatedPost = {
        ...oldPost,
        title:
            body.title !== undefined
                ? String(body.title)
                : oldPost.title,
        platform:
            body.platform !== undefined
                ? String(body.platform)
                : oldPost.platform,
        imageUrl:
            body.imageUrl !== undefined
                ? String(body.imageUrl)
                : oldPost.imageUrl || "",
        content:
            body.content !== undefined
                ? String(body.content)
                : oldPost.content || "",
        moodTag:
            body.moodTag !== undefined
                ? String(body.moodTag)
                : oldPost.moodTag || "📝 Мнение",
        publishAt:
            body.publishAt !== undefined
                ? String(body.publishAt)
                : oldPost.publishAt,
        isDraft:
            body.isDraft !== undefined
                ? body.isDraft === true
                : oldPost.isDraft === true,
        pinned:
            body.pinned !== undefined
                ? body.pinned === true
                : oldPost.pinned === true,
        updatedAt: new Date().toISOString()
    };

    normalizeAnalytics(updatedPost);

    posts[index] = updatedPost;

    writeJson(POSTS_FILE, posts);

    return syncAndRespond(res, {
        post: updatedPost
    });
});

app.delete("/api/posts/:id", requireAdmin, async (req, res) => {
    const posts = readJson(POSTS_FILE, []);

    const index = posts.findIndex(
        (post) => String(post.id) === String(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Пост не найден"
        });
    }

    const deleted = posts.splice(index, 1)[0];

    writeJson(POSTS_FILE, posts);

    return syncAndRespond(res, {
        deletedId: deleted.id
    });
});

app.post("/api/posts/:id/click", (req, res) => {
    const posts = readJson(POSTS_FILE, []);

    const post = posts.find(
        (item) => String(item.id) === String(req.params.id)
    );

    if (!post) {
        return res.status(404).json({
            success: false,
            error: "Пост не найден"
        });
    }

    normalizeAnalytics(post);

    const type = String(
        req.body && req.body.type
            ? req.body.type
            : "click"
    );

    const supportedTypes = [
        "like",
        "dislike",
        "share",
        "bookmark",
        "click"
    ];

    const analyticsKey = supportedTypes.includes(type)
        ? `${type}s`
        : "clicks";

    if (analyticsKey === "lik es") {
        post.analytics.likes += 1;
    } else if (analyticsKey === "dislikes") {
        post.analytics.dislikes += 1;
    } else if (analyticsKey === "shares") {
        post.analytics.shares += 1;
    } else if (analyticsKey === "bookmarks") {
        post.analytics.bookmarks += 1;
    } else {
        post.analytics.clicks += 1;
    }

    if (type === "like") {
        post.analytics.likes += 1;
    } else if (type === "dislike") {
        post.analytics.dislikes += 1;
    } else if (type === "share") {
        post.analytics.shares += 1;
    } else if (type === "bookmark") {
        post.analytics.bookmarks += 1;
    } else if (type === "click") {
        post.analytics.clicks += 1;
    }

    post.updatedAt = new Date().toISOString();

    writeJson(POSTS_FILE, posts);

    return res.json({
        success: true,
        analytics: post.analytics
    });
});

/* =========================
   RELEASES
========================= */

app.get("/api/releases", (req, res) => {
    const releases = readJson(RELEASES_FILE, []);

    const active = releases
        .filter((release) => release.archived !== true)
        .map(sanitizeReleaseForPublic);

    return res.json(active);
});

app.get(
    "/api/releases/archive",
    requireAdmin,
    (req, res) => {
        const releases = readJson(RELEASES_FILE, []);

        return res.json(releases);
    }
);

app.post(
    "/api/releases",
    requireAdmin,
    async (req, res) => {
        const releases = readJson(RELEASES_FILE, []);
        const body = req.body || {};

        const platforms = Array.isArray(body.platforms)
            ? body.platforms.map(String)
            : body.platform
                ? [String(body.platform)]
                : ["PC"];

        const release = {
            id: String(body.id || createId("release")),
            title: String(body.title || "Без названия"),
            platforms,
            platform: platforms.join(", "),
            releaseDate: String(
                body.releaseDate ||
                body.releaseAt ||
                new Date().toISOString()
            ),
            price:
                body.price === undefined ||
                body.price === ""
                    ? 0
                    : Number(body.price),
            backgroundUrl: String(
                body.backgroundUrl ||
                body.imageUrl ||
                ""
            ),
            imageUrl: String(body.imageUrl || ""),
            description: String(body.description || ""),
            archived: false,
            createdAt: new Date().toISOString(),
            pcRequirements: {
                minimum: {
                    cpu: String(
                        body.pcRequirements?.minimum?.cpu ||
                        body.minCpu ||
                        ""
                    ),
                    gpu: String(
                        body.pcRequirements?.minimum?.gpu ||
                        body.minGpu ||
                        ""
                    ),
                    ram: String(
                        body.pcRequirements?.minimum?.ram ||
                        body.minRam ||
                        ""
                    ),
                    storage: String(
                        body.pcRequirements?.minimum?.storage ||
                        body.minStorage ||
                        ""
                    )
                },
                recommended: {
                    cpu: String(
                        body.pcRequirements?.recommended?.cpu ||
                        body.recommendedCpu ||
                        ""
                    ),
                    gpu: String(
                        body.pcRequirements?.recommended?.gpu ||
                        body.recommendedGpu ||
                        ""
                    ),
                    ram: String(
                        body.pcRequirements?.recommended?.ram ||
                        body.recommendedRam ||
                        ""
                    ),
                    storage: String(
                        body.pcRequirements?.recommended?.storage ||
                        body.recommendedStorage ||
                        ""
                    )
                }
            },
            votes: {
                pc: 0,
                playstation: 0,
                xbox: 0
            }
        };

        if (!Number.isFinite(release.price)) {
            release.price = 0;
        }

        releases.unshift(release);

        writeJson(RELEASES_FILE, releases);

        return syncAndRespond(res, {
            release
        });
    }
);

app.patch(
    "/api/releases/:id/archive",
    requireAdmin,
    async (req, res) => {
        const releases = readJson(RELEASES_FILE, []);

        const release = releases.find(
            (item) => String(item.id) === String(req.params.id)
        );

        if (!release) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        release.archived =
            req.body && req.body.archived !== undefined
                ? req.body.archived === true
                : !release.archived;

        release.updatedAt = new Date().toISOString();

        writeJson(RELEASES_FILE, releases);

        return syncAndRespond(res, {
            release
        });
    }
);

app.delete(
    "/api/releases/:id",
    requireAdmin,
    async (req, res) => {
        const releases = readJson(RELEASES_FILE, []);

        const index = releases.findIndex(
            (item) => String(item.id) === String(req.params.id)
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        const deleted = releases.splice(index, 1)[0];

        writeJson(RELEASES_FILE, releases);

        return syncAndRespond(res, {
            deletedId: deleted.id
        });
    }
);

app.post(
    "/api/releases/:id/vote",
    (req, res) => {
        const releases = readJson(RELEASES_FILE, []);

        const release = releases.find(
            (item) => String(item.id) === String(req.params.id)
        );

        if (!release) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        if (!release.votes || typeof release.votes !== "object") {
            release.votes = {
                pc: 0,
                playstation: 0,
                xbox: 0
            };
        }

        const platform = String(
            req.body?.platform ||
            req.body?.vote ||
            ""
        ).toLowerCase();

        if (
            platform !== "pc" &&
            platform !== "playstation" &&
            platform !== "xbox"
        ) {
            return res.status(400).json({
                success: false,
                error: "Некорректная платформа"
            });
        }

        release.votes[platform] =
            Number(release.votes[platform] || 0) + 1;

        writeJson(RELEASES_FILE, releases);

        return res.json({
            success: true,
            votes: release.votes
        });
    }
);

/* =========================
   MUSIC
========================= */

app.get("/api/music", (req, res) => {
    const config = getConfig();

    return res.json({
        musicPlaylist: sanitizeMusicPlaylist(
            config.musicPlaylist
        )
    });
});

app.post(
    "/api/music/manage",
    requireAdmin,
    async (req, res) => {
        const config = getConfig();

        const playlist = Array.isArray(req.body?.musicPlaylist)
            ? req.body.musicPlaylist
            : [];

        config.musicPlaylist =
            sanitizeMusicPlaylist(playlist);

        writeJson(CONFIG_FILE, config);

        return syncAndRespond(res, {
            musicPlaylist: config.musicPlaylist
        });
    }
);

app.delete(
    "/api/admin/music/:id",
    requireAdmin,
    async (req, res) => {
        const config = getConfig();

        const playlist = normalizeMusicPlaylist(
            config.musicPlaylist
        );

        const index = playlist.findIndex(
            (track) => String(track.id) === String(req.params.id)
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Трек не найден"
            });
        }

        const deleted = playlist.splice(index, 1)[0];

        config.musicPlaylist = playlist;

        writeJson(CONFIG_FILE, config);

        return syncAndRespond(res, {
            deletedId: deleted.id,
            musicPlaylist: playlist
        });
    }
);

/* =========================
   ADMIN CONFIG
========================= */

app.post(
    "/api/admin/config",
    async (req, res) => {
        const config = getConfig();

        const currentPassword =
            req.body &&
            typeof req.body.password === "string"
                ? req.body.password
                : "";

        if (currentPassword !== config.password) {
            return res.status(401).json({
                success: false,
                error: "Сервер отклонил пароль"
            });
        }

        const siteName =
            req.body.siteName !== undefined
                ? String(req.body.siteName).trim()
                : config.siteName;

        const footerText =
            req.body.footerText !== undefined
                ? String(req.body.footerText)
                : config.footerText;

        const newPassword =
            req.body.newPassword !== undefined
                ? String(req.body.newPassword)
                : "";

        config.siteName =
            siteName || config.siteName || "PlayPC";

        config.footerText = footerText;

        if (newPassword.trim()) {
            config.password = newPassword.trim();
        }

        if (!Array.isArray(config.musicPlaylist)) {
            config.musicPlaylist = [];
        }

        writeJson(CONFIG_FILE, config);

        return syncAndRespond(res, {
            siteName: config.siteName,
            footerText: config.footerText,
            musicPlaylist: config.musicPlaylist
        });
    }
);

/* =========================
   CLEAR DATABASE
========================= */

app.post(
    "/api/admin/clear-all",
    requireAdmin,
    async (req, res) => {
        writeJson(POSTS_FILE, []);
        writeJson(RELEASES_FILE, []);
        writeJson(QUIZ_FILE, clone(DEFAULT_QUIZ));
        writeJson(POLL_FILE, clone(DEFAULT_POLL));

        const config = getConfig();

        config.musicPlaylist = [];

        writeJson(CONFIG_FILE, config);

        return syncAndRespond(res, {
            message: "База PlayPC очищена"
        });
    }
);

/* =========================
   POLL
========================= */

app.get("/api/poll", (req, res) => {
    const poll = normalizePoll(
        readJson(POLL_FILE, DEFAULT_POLL)
    );

    writeJson(POLL_FILE, poll);

    return res.json(poll);
});

app.post("/api/poll/vote", (req, res) => {
    const poll = normalizePoll(
        readJson(POLL_FILE, DEFAULT_POLL)
    );

    const rawIndex =
        req.body?.optionIndex ??
        req.body?.index ??
        req.body?.answerIndex;

    const optionIndex = Number(rawIndex);

    if (
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= poll.options.length
    ) {
        return res.status(400).json({
            success: false,
            error: "Некорректный вариант ответа"
        });
    }

    poll.votes[optionIndex] += 1;
    poll.totalVotes += 1;

    writeJson(POLL_FILE, poll);

    return res.json({
        success: true,
        poll
    });
});

app.post(
    "/api/poll/manage",
    requireAdmin,
    async (req, res) => {
        const oldPoll = normalizePoll(
            readJson(POLL_FILE, DEFAULT_POLL)
        );

        const body = req.body || {};

        const options = Array.isArray(body.options)
            ? body.options
                .map((option) => {
                    if (typeof option === "string") {
                        return option.trim();
                    }

                    if (option && typeof option === "object") {
                        return String(
                            option.text ??
                            option.title ??
                            option.label ??
                            ""
                        ).trim();
                    }

                    return "";
                })
                .filter(Boolean)
            : oldPoll.options;

        const poll = {
            question:
                body.question !== undefined
                    ? String(body.question)
                    : oldPoll.question,
            options:
                options.length > 0
                    ? options
                    : oldPoll.options,
            votes: [],
            totalVotes: 0,
            updatedAt: new Date().toISOString()
        };

        const resetVotes =
            body.resetVotes === true ||
            body.resetVotes === "true";

        if (resetVotes) {
            poll.votes = poll.options.map(() => 0);
        } else {
            poll.votes = poll.options.map(
                (_, index) =>
                    Number(oldPoll.votes[index] || 0)
            );
        }

        poll.totalVotes = poll.votes.reduce(
            (sum, value) => sum + value,
            0
        );

        writeJson(POLL_FILE, poll);

        return syncAndRespond(res, {
            poll
        });
    }
);

/* =========================
   QUIZ
========================= */

app.get("/api/quiz", (req, res) => {
    const quiz = normalizeQuiz(
        readJson(QUIZ_FILE, DEFAULT_QUIZ)
    );

    writeJson(QUIZ_FILE, quiz);

    return res.json(
        sanitizeQuizForPublic(quiz)
    );
});

app.post(
    "/api/quiz/manage",
    requireAdmin,
    async (req, res) => {
        const body = req.body || {};

        const options = Array.isArray(body.options)
            ? body.options.map((option) => {
                if (typeof option === "string") {
                    return option;
                }

                if (option && typeof option === "object") {
                    return String(
                        option.text ??
                        option.title ??
                        option.label ??
                        ""
                    );
                }

                return String(option ?? "");
            })
            : clone(DEFAULT_QUIZ.options);

        const rawCorrectIndex =
            body.correctIndex ??
            body.answerIndex ??
            0;

        const correctIndex = Number(rawCorrectIndex);

        const quiz = normalizeQuiz({
            question: String(
                body.question ||
                DEFAULT_QUIZ.question
            ),
            image: String(body.image || ""),
            options,
            correctIndex:
                Number.isInteger(correctIndex)
                    ? correctIndex
                    : 0,
            updatedAt: new Date().toISOString()
        });

        writeJson(QUIZ_FILE, quiz);

        return syncAndRespond(res, {
            quiz: sanitizeQuizForPublic(quiz)
        });
    }
);

app.post("/api/quiz/answer", (req, res) => {
    const quiz = normalizeQuiz(
        readJson(QUIZ_FILE, DEFAULT_QUIZ)
    );

    const rawIndex =
        req.body?.answerIndex ??
        req.body?.index ??
        req.body?.optionIndex;

    const answerIndex = Number(rawIndex);

    if (
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= quiz.options.length
    ) {
        return res.status(400).json({
            success: false,
            error: "Некорректный ответ"
        });
    }

    const correct =
        answerIndex === quiz.correctIndex;

    return res.json({
        success: true,
        correct,
        answerIndex,
        correctIndex: quiz.correctIndex
    });
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
    return res.json({
        success: true,
        status: "online",
        siteName: getConfig().siteName,
        time: new Date().toISOString()
    });
});

/* =========================
   FALLBACK
========================= */

app.get("*", (req, res) => {
    if (
        req.path.startsWith("/api/") ||
        req.path.startsWith("/api")
    ) {
        return res.status(404).json({
            success: false,
            error: "API route not found"
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

/* =========================
   ERROR HANDLER
========================= */

app.use((error, req, res, next) => {
    console.error("Server error:", error);

    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({
        success: false,
        error: "Внутренняя ошибка сервера"
    });
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
    console.log("======================================");
    console.log("          PlayPC SERVER ONLINE");
    console.log("======================================");
    console.log(`Port: ${PORT}`);
    console.log(`Public: ${PUBLIC_DIR}`);
    console.log("Config: config.json");
    console.log("Admin password: loaded dynamically from config.json");
    console.log("GitHub auto-sync: enabled");
    console.log("======================================");
});