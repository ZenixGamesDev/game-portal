const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

/*
 * Render Persistent Disk:
 *   /data
 *
 * Local development:
 *   project root
 *
 * Если /data существует и доступен для записи — используем его.
 * Иначе все JSON-файлы сохраняются в корне проекта.
 */
const RENDER_DATA_DIR = path.join("/data");
const LOCAL_DATA_DIR = __dirname;

function getDataDirectory() {
    try {
        if (!fs.existsSync(RENDER_DATA_DIR)) {
            return LOCAL_DATA_DIR;
        }

        fs.accessSync(RENDER_DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
        return RENDER_DATA_DIR;
    } catch (error) {
        return LOCAL_DATA_DIR;
    }
}

const DATA_DIR = getDataDirectory();

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const RELEASES_FILE = path.join(DATA_DIR, "releases.json");
const QUIZ_FILE = path.join(DATA_DIR, "quiz.json");

const DEFAULT_CONFIG = {
    password: "AdminPlayPC2026",
    siteName: "PlayPC"
};

const DEFAULT_QUIZ_DATA = {
    question: "Какой игровой релиз вы ждёте больше всего?",
    screenshotUrl: "",
    options: [
        "Вариант 1",
        "Вариант 2",
        "Вариант 3"
    ],
    correctIndex: 0,
    poll: {
        topic: "Опрос месяца",
        options: [
            { text: "Вариант 1", votes: 0 },
            { text: "Вариант 2", votes: 0 },
            { text: "Вариант 3", votes: 0 }
        ]
    }
};

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

function ensureDataDirectory() {
    if (DATA_DIR === RENDER_DATA_DIR) {
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        } catch (error) {
            console.error("Не удалось создать /data:", error.message);
        }
    }
}

function ensureJsonFile(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(
                filePath,
                JSON.stringify(defaultValue, null, 2),
                "utf8"
            );
        }
    } catch (error) {
        console.error(`Ошибка создания ${filePath}:`, error.message);
    }
}

function readJson(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) {
            ensureJsonFile(filePath, defaultValue);
            return defaultValue;
        }

        const raw = fs.readFileSync(filePath, "utf8").trim();

        if (!raw) {
            ensureJsonFile(filePath, defaultValue);
            return defaultValue;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(`Ошибка чтения ${filePath}:`, error.message);
        return defaultValue;
    }
}

function writeJson(filePath, data) {
    try {
        fs.writeFileSync(
            filePath,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        return true;
    } catch (error) {
        console.error(`Ошибка записи ${filePath}:`, error.message);
        return false;
    }
}

function getConfig() {
    const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

    return {
        password:
            typeof config.password === "string" && config.password.length > 0
                ? config.password
                : DEFAULT_CONFIG.password,

        siteName:
            typeof config.siteName === "string" && config.siteName.trim()
                ? config.siteName.trim()
                : DEFAULT_CONFIG.siteName
    };
}

function getAdminPassword(req) {
    const headerPassword =
        req.get("X-Admin-Password") ||
        req.get("X-Password");

    const queryPassword =
        typeof req.query.password === "string"
            ? req.query.password
            : "";

    const bodyPassword =
        req.body && typeof req.body.password === "string"
            ? req.body.password
            : "";

    return headerPassword || queryPassword || bodyPassword || "";
}

function requireAdmin(req, res, next) {
    const config = getConfig();
    const password = getAdminPassword(req);

    if (!password || password !== config.password) {
        return res.status(401).json({
            success: false,
            error: "Неверный пароль администратора"
        });
    }

    req.isAdmin = true;
    next();
}

function normalizeBoolean(value, fallback = false) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (["true", "1", "yes", "on"].includes(normalized)) {
            return true;
        }

        if (["false", "0", "no", "off"].includes(normalized)) {
            return false;
        }
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    return fallback;
}

function normalizeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}

function normalizePlatforms(platforms) {
    if (Array.isArray(platforms)) {
        return platforms
            .map((platform) => String(platform).trim())
            .filter(Boolean);
    }

    if (typeof platforms === "string") {
        return platforms
            .split(",")
            .map((platform) => platform.trim())
            .filter(Boolean);
    }

    return [];
}

function normalizePost(post) {
    if (!post || typeof post !== "object") {
        return null;
    }

    const normalized = {
        id:
            post.id !== undefined && post.id !== null
                ? post.id
                : Date.now(),

        title:
            typeof post.title === "string"
                ? post.title.trim()
                : "",

        content:
            typeof post.content === "string"
                ? post.content
                : "",

        platform:
            typeof post.platform === "string"
                ? post.platform
                : "",

        imageUrl:
            typeof post.imageUrl === "string"
                ? post.imageUrl
                : "",

        pinned: normalizeBoolean(post.pinned, false),

        isDraft: normalizeBoolean(post.isDraft, false),

        publishAt:
            typeof post.publishAt === "string"
                ? post.publishAt
                : "",

        moodTag:
            typeof post.moodTag === "string"
                ? post.moodTag
                : "",

        createdAt:
            typeof post.createdAt === "string"
                ? post.createdAt
                : new Date().toISOString(),

        updatedAt:
            typeof post.updatedAt === "string"
                ? post.updatedAt
                : new Date().toISOString(),

        votesWillPlay: normalizeNumber(
            post.votesWillPlay !== undefined
                ? post.votesWillPlay
                : post.willPlay,
            0
        ),

        votesWontPlay: normalizeNumber(
            post.votesWontPlay !== undefined
                ? post.votesWontPlay
                : post.wontPlay,
            0
        )
    };

    normalized.willPlay = normalized.votesWillPlay;
    normalized.wontPlay = normalized.votesWontPlay;

    return normalized;
}

function normalizeRelease(release) {
    if (!release || typeof release !== "object") {
        return null;
    }

    const normalized = {
        id:
            release.id !== undefined && release.id !== null
                ? release.id
                : Date.now(),

        title:
            typeof release.title === "string"
                ? release.title.trim()
                : "",

        releaseDate:
            typeof release.releaseDate === "string"
                ? release.releaseDate
                : "",

        priceDigital: normalizeNumber(
            release.priceDigital,
            0
        ),

        priceDisk: normalizeNumber(
            release.priceDisk,
            0
        ),

        platforms: normalizePlatforms(
            release.platforms
        ),

        systemReq:
            typeof release.systemReq === "string"
                ? release.systemReq
                : "",

        bgUrl:
            typeof release.bgUrl === "string"
                ? release.bgUrl
                : "",

        discount: normalizeNumber(
            release.discount,
            0
        ),

        isMainHit: normalizeBoolean(
            release.isMainHit,
            false
        ),

        isArchived: normalizeBoolean(
            release.isArchived,
            false
        ),

        createdAt:
            typeof release.createdAt === "string"
                ? release.createdAt
                : new Date().toISOString(),

        updatedAt:
            typeof release.updatedAt === "string"
                ? release.updatedAt
                : new Date().toISOString(),

        votesWillPlay: normalizeNumber(
            release.votesWillPlay !== undefined
                ? release.votesWillPlay
                : release.willPlay,
            0
        ),

        votesWontPlay: normalizeNumber(
            release.votesWontPlay !== undefined
                ? release.votesWontPlay
                : release.wontPlay,
            0
        )
    };

    normalized.willPlay = normalized.votesWillPlay;
    normalized.wontPlay = normalized.votesWontPlay;

    return normalized;
}

function normalizeQuiz(data) {
    if (!data || typeof data !== "object") {
        return JSON.parse(JSON.stringify(DEFAULT_QUIZ_DATA));
    }

    const options = Array.isArray(data.options)
        ? data.options
            .map((option) => String(option).trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

    const pollSource =
        data.poll && typeof data.poll === "object"
            ? data.poll
            : DEFAULT_QUIZ_DATA.poll;

    const pollOptions = Array.isArray(pollSource.options)
        ? pollSource.options.map((option) => {
            if (typeof option === "string") {
                return {
                    text: option,
                    votes: 0
                };
            }

            return {
                text:
                    option &&
                    typeof option.text === "string"
                        ? option.text.trim()
                        : "",
                votes: normalizeNumber(
                    option && option.votes,
                    0
                )
            };
        }).filter((option) => option.text)
        : [];

    return {
        question:
            typeof data.question === "string" && data.question.trim()
                ? data.question.trim()
                : DEFAULT_QUIZ_DATA.question,

        screenshotUrl:
            typeof data.screenshotUrl === "string"
                ? data.screenshotUrl
                : "",

        options:
            options.length > 0
                ? options
                : [...DEFAULT_QUIZ_DATA.options],

        correctIndex: Math.max(
            0,
            Math.min(
                options.length > 0
                    ? options.length - 1
                    : DEFAULT_QUIZ_DATA.options.length - 1,
                Math.floor(
                    normalizeNumber(
                        data.correctIndex,
                        0
                    )
                )
            )
        ),

        poll: {
            topic:
                typeof pollSource.topic === "string" &&
                pollSource.topic.trim()
                    ? pollSource.topic.trim()
                    : DEFAULT_QUIZ_DATA.poll.topic,

            options:
                pollOptions.length > 0
                    ? pollOptions
                    : DEFAULT_QUIZ_DATA.poll.options.map(
                        (option) => ({ ...option })
                    )
        }
    };
}

function getPosts() {
    const raw = readJson(POSTS_FILE, []);
    const posts = Array.isArray(raw) ? raw : [];

    return posts
        .map(normalizePost)
        .filter(Boolean);
}

function getReleases() {
    const raw = readJson(RELEASES_FILE, []);
    const releases = Array.isArray(raw) ? raw : [];

    return releases
        .map(normalizeRelease)
        .filter(Boolean);
}

function savePosts(posts) {
    return writeJson(
        POSTS_FILE,
        posts.map(normalizePost).filter(Boolean)
    );
}

function saveReleases(releases) {
    return writeJson(
        RELEASES_FILE,
        releases.map(normalizeRelease).filter(Boolean)
    );
}

function saveQuiz(quiz) {
    return writeJson(
        QUIZ_FILE,
        normalizeQuiz(quiz)
    );
}

function createId(items) {
    let id = Date.now();

    const ids = new Set(
        items.map((item) => String(item.id))
    );

    while (ids.has(String(id))) {
        id += 1;
    }

    return id;
}

function isFuturePublishDate(publishAt) {
    if (!publishAt) {
        return false;
    }

    const timestamp = new Date(publishAt).getTime();

    if (!Number.isFinite(timestamp)) {
        return false;
    }

    return timestamp > Date.now();
}

function sortPosts(posts) {
    return [...posts].sort((a, b) => {
        if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
        }

        const dateA = new Date(
            a.createdAt || a.updatedAt || 0
        ).getTime();

        const dateB = new Date(
            b.createdAt || b.updatedAt || 0
        ).getTime();

        return dateB - dateA;
    });
}

function sortReleasesByDate(releases) {
    return [...releases].sort((a, b) => {
        const dateA = new Date(a.releaseDate).getTime();
        const dateB = new Date(b.releaseDate).getTime();

        if (!Number.isFinite(dateA) && !Number.isFinite(dateB)) {
            return 0;
        }

        if (!Number.isFinite(dateA)) {
            return 1;
        }

        if (!Number.isFinite(dateB)) {
            return -1;
        }

        return dateA - dateB;
    });
}

function sortReleasesByPrice(releases) {
    return [...releases].sort((a, b) => {
        const priceA = normalizeNumber(a.priceDigital, 0);
        const priceB = normalizeNumber(b.priceDigital, 0);

        return priceA - priceB;
    });
}

/*
 * Инициализация базы данных.
 * На Render при подключённом Persistent Disk:
 *   /data/posts.json
 *   /data/releases.json
 *   /data/config.json
 *   /data/quiz.json
 *
 * Локально:
 *   ./posts.json
 *   ./releases.json
 *   ./config.json
 *   ./quiz.json
 */
ensureDataDirectory();

ensureJsonFile(
    CONFIG_FILE,
    DEFAULT_CONFIG
);

ensureJsonFile(
    POSTS_FILE,
    []
);

ensureJsonFile(
    RELEASES_FILE,
    []
);

ensureJsonFile(
    QUIZ_FILE,
    DEFAULT_QUIZ_DATA
);

/* =========================
   PUBLIC CONFIG
========================= */

app.get("/api/config", (req, res) => {
    const config = getConfig();

    res.json({
        siteName: config.siteName
    });
});

/* =========================
   POSTS / NEWS
========================= */

app.get("/api/posts", (req, res) => {
    const posts = getPosts();

    const suppliedPassword = getAdminPassword(req);
    const config = getConfig();

    const isAdmin =
        suppliedPassword &&
        suppliedPassword === config.password;

    if (isAdmin) {
        return res.json(sortPosts(posts));
    }

    const publicPosts = posts.filter((post) => {
        if (post.isDraft === true) {
            return false;
        }

        if (isFuturePublishDate(post.publishAt)) {
            return false;
        }

        return true;
    });

    return res.json(sortPosts(publicPosts));
});

app.post("/api/posts", requireAdmin, (req, res) => {
    const body = req.body || {};

    const title =
        typeof body.title === "string"
            ? body.title.trim()
            : "";

    const content =
        typeof body.content === "string"
            ? body.content
            : "";

    if (!title) {
        return res.status(400).json({
            success: false,
            error: "Заголовок новости обязателен"
        });
    }

    if (!content.trim()) {
        return res.status(400).json({
            success: false,
            error: "Текст новости обязателен"
        });
    }

    const posts = getPosts();
    const now = new Date().toISOString();

    const post = normalizePost({
        id: createId(posts),
        title,
        content,
        platform:
            typeof body.platform === "string"
                ? body.platform.trim()
                : "",
        imageUrl:
            typeof body.imageUrl === "string"
                ? body.imageUrl.trim()
                : "",
        pinned: normalizeBoolean(
            body.pinned,
            false
        ),
        isDraft: normalizeBoolean(
            body.isDraft,
            false
        ),
        publishAt:
            typeof body.publishAt === "string"
                ? body.publishAt
                : "",
        moodTag:
            typeof body.moodTag === "string"
                ? body.moodTag.trim()
                : "",
        createdAt: now,
        updatedAt: now,
        votesWillPlay: 0,
        votesWontPlay: 0
    });

    posts.push(post);

    if (!savePosts(posts)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить новость"
        });
    }

    res.status(201).json({
        success: true,
        post
    });
});

app.patch("/api/posts/:id", requireAdmin, (req, res) => {
    const posts = getPosts();
    const id = String(req.params.id);

    const index = posts.findIndex(
        (post) => String(post.id) === id
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Новость не найдена"
        });
    }

    const body = req.body || {};
    const post = posts[index];

    if (body.title !== undefined) {
        if (
            typeof body.title !== "string" ||
            !body.title.trim()
        ) {
            return res.status(400).json({
                success: false,
                error: "Заголовок не может быть пустым"
            });
        }

        post.title = body.title.trim();
    }

    if (body.content !== undefined) {
        if (
            typeof body.content !== "string" ||
            !body.content.trim()
        ) {
            return res.status(400).json({
                success: false,
                error: "Текст новости не может быть пустым"
            });
        }

        post.content = body.content;
    }

    if (body.platform !== undefined) {
        post.platform =
            typeof body.platform === "string"
                ? body.platform.trim()
                : "";
    }

    if (body.imageUrl !== undefined) {
        post.imageUrl =
            typeof body.imageUrl === "string"
                ? body.imageUrl.trim()
                : "";
    }

    if (body.pinned !== undefined) {
        post.pinned = normalizeBoolean(
            body.pinned,
            post.pinned
        );
    }

    if (body.isDraft !== undefined) {
        post.isDraft = normalizeBoolean(
            body.isDraft,
            post.isDraft
        );
    }

    if (body.publishAt !== undefined) {
        post.publishAt =
            typeof body.publishAt === "string"
                ? body.publishAt
                : "";
    }

    if (body.moodTag !== undefined) {
        post.moodTag =
            typeof body.moodTag === "string"
                ? body.moodTag.trim()
                : "";
    }

    if (body.votesWillPlay !== undefined) {
        post.votesWillPlay = Math.max(
            0,
            normalizeNumber(
                body.votesWillPlay,
                post.votesWillPlay
            )
        );
    }

    if (body.votesWontPlay !== undefined) {
        post.votesWontPlay = Math.max(
            0,
            normalizeNumber(
                body.votesWontPlay,
                post.votesWontPlay
            )
        );
    }

    post.willPlay = post.votesWillPlay;
    post.wontPlay = post.votesWontPlay;
    post.updatedAt = new Date().toISOString();

    if (!savePosts(posts)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось обновить новость"
        });
    }

    res.json({
        success: true,
        post
    });
});

app.post("/api/posts/:id/vote", (req, res) => {
    const posts = getPosts();
    const id = String(req.params.id);

    const index = posts.findIndex(
        (post) => String(post.id) === id
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Новость не найдена"
        });
    }

    const type =
        req.body && typeof req.body.type === "string"
            ? req.body.type
            : "";

    if (
        type !== "willPlay" &&
        type !== "wontPlay"
    ) {
        return res.status(400).json({
            success: false,
            error: "Неверный тип голоса"
        });
    }

    if (type === "willPlay") {
        posts[index].votesWillPlay += 1;
    } else {
        posts[index].votesWontPlay += 1;
    }

    posts[index].willPlay =
        posts[index].votesWillPlay;

    posts[index].wontPlay =
        posts[index].votesWontPlay;

    posts[index].updatedAt =
        new Date().toISOString();

    if (!savePosts(posts)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить голос"
        });
    }

    res.json({
        success: true,
        willPlay: posts[index].votesWillPlay,
        wontPlay: posts[index].votesWontPlay,
        votesWillPlay: posts[index].votesWillPlay,
        votesWontPlay: posts[index].votesWontPlay
    });
});

app.delete("/api/posts/:id", requireAdmin, (req, res) => {
    const posts = getPosts();
    const id = String(req.params.id);

    const filtered = posts.filter(
        (post) => String(post.id) !== id
    );

    if (filtered.length === posts.length) {
        return res.status(404).json({
            success: false,
            error: "Новость не найдена"
        });
    }

    if (!savePosts(filtered)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось удалить новость"
        });
    }

    res.json({
        success: true
    });
});

/* =========================
   RELEASES
========================= */

app.get("/api/releases", (req, res) => {
    const releases = getReleases();

    const activeReleases = releases.filter(
        (release) => release.isArchived !== true
    );

    res.json(
        sortReleasesByDate(activeReleases)
    );
});

app.get("/api/releases/archive", requireAdmin, (req, res) => {
    const releases = getReleases();

    const archivedReleases = releases.filter(
        (release) => release.isArchived === true
    );

    res.json(
        sortReleasesByDate(archivedReleases)
    );
});

app.post("/api/releases", requireAdmin, (req, res) => {
    const body = req.body || {};

    const title =
        typeof body.title === "string"
            ? body.title.trim()
            : "";

    const releaseDate =
        typeof body.releaseDate === "string"
            ? body.releaseDate
            : "";

    if (!title) {
        return res.status(400).json({
            success: false,
            error: "Название релиза обязательно"
        });
    }

    if (!releaseDate) {
        return res.status(400).json({
            success: false,
            error: "Дата релиза обязательна"
        });
    }

    const parsedDate = new Date(releaseDate).getTime();

    if (!Number.isFinite(parsedDate)) {
        return res.status(400).json({
            success: false,
            error: "Некорректная дата релиза"
        });
    }

    const platforms = normalizePlatforms(
        body.platforms
    );

    const releases = getReleases();
    const now = new Date().toISOString();

    const release = normalizeRelease({
        id: createId(releases),
        title,
        releaseDate,
        priceDigital: normalizeNumber(
            body.priceDigital,
            0
        ),
        priceDisk: normalizeNumber(
            body.priceDisk,
            0
        ),
        platforms,
        systemReq:
            typeof body.systemReq === "string"
                ? body.systemReq
                : "",
        bgUrl:
            typeof body.bgUrl === "string"
                ? body.bgUrl.trim()
                : "",
        discount: Math.max(
            0,
            Math.min(
                100,
                normalizeNumber(
                    body.discount,
                    0
                )
            )
        ),
        isMainHit: normalizeBoolean(
            body.isMainHit,
            false
        ),
        isArchived: normalizeBoolean(
            body.isArchived,
            false
        ),
        createdAt: now,
        updatedAt: now,
        votesWillPlay: 0,
        votesWontPlay: 0
    });

    releases.push(release);

    if (!saveReleases(releases)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить релиз"
        });
    }

    res.status(201).json({
        success: true,
        release
    });
});

app.patch("/api/releases/:id/archive", requireAdmin, (req, res) => {
    const releases = getReleases();
    const id = String(req.params.id);

    const index = releases.findIndex(
        (release) => String(release.id) === id
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Релиз не найден"
        });
    }

    releases[index].isArchived =
        !releases[index].isArchived;

    releases[index].updatedAt =
        new Date().toISOString();

    if (!saveReleases(releases)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось изменить статус архива"
        });
    }

    res.json({
        success: true,
        release: releases[index]
    });
});

app.post("/api/releases/:id/vote", (req, res) => {
    const releases = getReleases();
    const id = String(req.params.id);

    const index = releases.findIndex(
        (release) => String(release.id) === id
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Релиз не найден"
        });
    }

    if (releases[index].isArchived) {
        return res.status(400).json({
            success: false,
            error: "Архивный релиз недоступен для голосования"
        });
    }

    const type =
        req.body && typeof req.body.type === "string"
            ? req.body.type
            : "";

    if (
        type !== "willPlay" &&
        type !== "wontPlay"
    ) {
        return res.status(400).json({
            success: false,
            error: "Неверный тип голоса"
        });
    }

    if (type === "willPlay") {
        releases[index].votesWillPlay += 1;
    } else {
        releases[index].votesWontPlay += 1;
    }

    releases[index].willPlay =
        releases[index].votesWillPlay;

    releases[index].wontPlay =
        releases[index].votesWontPlay;

    releases[index].updatedAt =
        new Date().toISOString();

    if (!saveReleases(releases)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить голос"
        });
    }

    res.json({
        success: true,
        votesWillPlay:
            releases[index].votesWillPlay,
        votesWontPlay:
            releases[index].votesWontPlay,
        willPlay:
            releases[index].votesWillPlay,
        wontPlay:
            releases[index].votesWontPlay
    });
});

app.delete("/api/releases/:id", requireAdmin, (req, res) => {
    const releases = getReleases();
    const id = String(req.params.id);

    const filtered = releases.filter(
        (release) => String(release.id) !== id
    );

    if (filtered.length === releases.length) {
        return res.status(404).json({
            success: false,
            error: "Релиз не найден"
        });
    }

    if (!saveReleases(filtered)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось удалить релиз"
        });
    }

    res.json({
        success: true
    });
});

/* =========================
   QUIZ
========================= */

app.get("/api/quiz", (req, res) => {
    const quiz = normalizeQuiz(
        readJson(
            QUIZ_FILE,
            DEFAULT_QUIZ_DATA
        )
    );

    res.json({
        question: quiz.question,
        screenshotUrl: quiz.screenshotUrl,
        options: quiz.options
    });
});

app.post("/api/quiz/manage", requireAdmin, (req, res) => {
    const body = req.body || {};

    const options = Array.isArray(body.options)
        ? body.options
            .map((option) => String(option).trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

    if (
        typeof body.question !== "string" ||
        !body.question.trim()
    ) {
        return res.status(400).json({
            success: false,
            error: "Вопрос викторины обязателен"
        });
    }

    if (options.length < 2) {
        return res.status(400).json({
            success: false,
            error: "Нужно минимум 2 варианта ответа"
        });
    }

    const correctIndex = Math.floor(
        normalizeNumber(
            body.correctIndex,
            0
        )
    );

    if (
        correctIndex < 0 ||
        correctIndex >= options.length
    ) {
        return res.status(400).json({
            success: false,
            error: "Неверный индекс правильного ответа"
        });
    }

    const currentQuiz = normalizeQuiz(
        readJson(
            QUIZ_FILE,
            DEFAULT_QUIZ_DATA
        )
    );

    const quiz = normalizeQuiz({
        question: body.question.trim(),
        screenshotUrl:
            typeof body.screenshotUrl === "string"
                ? body.screenshotUrl.trim()
                : "",
        options,
        correctIndex,
        poll: currentQuiz.poll
    });

    if (!saveQuiz(quiz)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить викторину"
        });
    }

    res.json({
        success: true,
        quiz: {
            question: quiz.question,
            screenshotUrl: quiz.screenshotUrl,
            options: quiz.options
        }
    });
});

app.post("/api/quiz/answer", (req, res) => {
    const quiz = normalizeQuiz(
        readJson(
            QUIZ_FILE,
            DEFAULT_QUIZ_DATA
        )
    );

    const rawIndex =
        req.body &&
        (
            req.body.answerIndex !== undefined
                ? req.body.answerIndex
                : req.body.index
        );

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

    res.json({
        correct:
            answerIndex === quiz.correctIndex,

        correctIndex:
            quiz.correctIndex
    });
});

/* =========================
   POLL
========================= */

app.get("/api/poll", (req, res) => {
    const quiz = normalizeQuiz(
        readJson(
            QUIZ_FILE,
            DEFAULT_QUIZ_DATA
        )
    );

    res.json({
        topic: quiz.poll.topic,
        options: quiz.poll.options
    });
});

app.post("/api/poll/vote", (req, res) => {
    const quiz = normalizeQuiz(
        readJson(
            QUIZ_FILE,
            DEFAULT_QUIZ_DATA
        )
    );

    const body = req.body || {};

    const rawIndex =
        body.answerIndex !== undefined
            ? body.answerIndex
            : body.optionIndex !== undefined
                ? body.optionIndex
                : body.index;

    const index = Number(rawIndex);

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= quiz.poll.options.length
    ) {
        return res.status(400).json({
            success: false,
            error: "Некорректный вариант ответа"
        });
    }

    quiz.poll.options[index].votes += 1;

    if (!saveQuiz(quiz)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить голос"
        });
    }

    res.json({
        success: true,
        options: quiz.poll.options
    });
});

app.post("/api/poll/manage", requireAdmin, (req, res) => {
    const body = req.body || {};

    const topic =
        typeof body.topic === "string"
            ? body.topic.trim()
            : "";

    if (!topic) {
        return res.status(400).json({
            success: false,
            error: "Тема опроса обязательна"
        });
    }

    const options = Array.isArray(body.options)
        ? body.options
            .map((option) => {
                if (
                    option &&
                    typeof option === "object"
                ) {
                    return {
                        text:
                            typeof option.text === "string"
                                ? option.text.trim()
                                : "",
                        votes: normalizeNumber(
                            option.votes,
                            0
                        )
                    };
                }

                return {
                    text: String(option).trim(),
                    votes: 0
                };
            })
            .filter((option) => option.text)
            .slice(0, 10)
        : [];

    if (options.length < 2) {
        return res.status(400).json({
            success: false,
            error: "Нужно минимум 2 варианта опроса"
        });
    }

    const currentQuiz = normalizeQuiz(
        readJson(
            QUIZ_FILE,
            DEFAULT_QUIZ_DATA
        )
    );

    const resetVotes =
        body.resetVotes === true ||
        body.resetVotes === "true" ||
        body.resetVotes === 1 ||
        body.resetVotes === "1";

    const finalOptions = options.map((option) => ({
        text: option.text,
        votes: resetVotes
            ? 0
            : Math.max(
                0,
                normalizeNumber(
                    option.votes,
                    0
                )
            )
    }));

    const quiz = normalizeQuiz({
        question: currentQuiz.question,
        screenshotUrl: currentQuiz.screenshotUrl,
        options: currentQuiz.options,
        correctIndex: currentQuiz.correctIndex,
        poll: {
            topic,
            options: finalOptions
        }
    });

    if (!saveQuiz(quiz)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить опрос"
        });
    }

    res.json({
        success: true,
        poll: quiz.poll
    });
});

/* =========================
   ADMIN CONFIG
========================= */

app.post("/api/admin/config", requireAdmin, (req, res) => {
    const body = req.body || {};
    const currentConfig = getConfig();

    const newSiteName =
        typeof body.siteName === "string"
            ? body.siteName.trim()
            : currentConfig.siteName;

    const requestedPassword =
        typeof body.newPassword === "string"
            ? body.newPassword
            : typeof body.adminPassword === "string"
                ? body.adminPassword
                : typeof body.password === "string"
                    ? body.password
                    : "";

    let newPassword = currentConfig.password;

    if (requestedPassword.trim()) {
        newPassword = requestedPassword;
    }

    if (!newSiteName) {
        return res.status(400).json({
            success: false,
            error: "Название сайта не может быть пустым"
        });
    }

    if (newPassword.length < 4) {
        return res.status(400).json({
            success: false,
            error: "Пароль должен содержать минимум 4 символа"
        });
    }

    const newConfig = {
        password: newPassword,
        siteName: newSiteName
    };

    if (!writeJson(CONFIG_FILE, newConfig)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить настройки"
        });
    }

    res.json({
        success: true,
        siteName: newConfig.siteName
    });
});

/* =========================
   CLEAR DATABASE
========================= */

app.post("/api/admin/clear-all", requireAdmin, (req, res) => {
    const postsSaved = savePosts([]);
    const releasesSaved = saveReleases([]);

    if (!postsSaved || !releasesSaved) {
        return res.status(500).json({
            success: false,
            error: "Не удалось полностью очистить базу данных"
        });
    }

    res.json({
        success: true,
        message: "Новости и релизы полностью очищены"
    });
});

/* =========================
   API 404
========================= */

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        error: "API маршрут не найден"
    });
});

/* =========================
   STATIC FRONTEND
========================= */

app.use(
    express.static(PUBLIC_DIR, {
        extensions: ["html"],
        index: "index.html"
    })
);

/*
 * SPA fallback.
 * Важно: не использовать app.get("*") / app.get("/*"),
 * чтобы не столкнуться с изменениями wildcard-синтаксиса
 * в новых версиях Express.
 */
app.use((req, res, next) => {
    if (
        req.method !== "GET" &&
        req.method !== "HEAD"
    ) {
        return next();
    }

    if (req.path.startsWith("/api/")) {
        return next();
    }

    const indexFile = path.join(
        PUBLIC_DIR,
        "index.html"
    );

    if (!fs.existsSync(indexFile)) {
        return res.status(404).send(
            "Frontend file public/index.html not found."
        );
    }

    return res.sendFile(indexFile);
});

/* =========================
   ERROR HANDLER
========================= */

app.use((error, req, res, next) => {
    console.error("Server error:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Внутренняя ошибка сервера"
    });
});

/* =========================
   SERVER START
========================= */

app.listen(PORT, "0.0.0.0", () => {
    console.log("========================================");
    console.log("PlayPC server started");
    console.log(`Port: ${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    console.log(`Config: ${CONFIG_FILE}`);
    console.log(`Posts: ${POSTS_FILE}`);
    console.log(`Releases: ${RELEASES_FILE}`);
    console.log(`Quiz: ${QUIZ_FILE}`);
    console.log(
        DATA_DIR === RENDER_DATA_DIR
            ? "Storage mode: Render Persistent Disk (/data)"
            : "Storage mode: Local project directory"
    );
    console.log("========================================");
});