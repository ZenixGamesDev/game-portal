const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const CONFIG_FILE = path.join(__dirname, "config.json");
const POSTS_FILE = path.join(__dirname, "posts.json");
const RELEASES_FILE = path.join(__dirname, "releases.json");
const QUIZ_FILE = path.join(__dirname, "quiz.json");

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
            {
                text: "Вариант 1",
                votes: 0
            },
            {
                text: "Вариант 2",
                votes: 0
            },
            {
                text: "Вариант 3",
                votes: 0
            }
        ]
    }
};

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(PUBLIC_DIR));

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
        console.error(`Ошибка инициализации ${filePath}:`, error);
    }
}

function readJson(filePath, fallback) {
    try {
        ensureJsonFile(filePath, fallback);

        const raw = fs.readFileSync(filePath, "utf8").trim();

        if (!raw) {
            return fallback;
        }

        const parsed = JSON.parse(raw);

        return parsed;
    } catch (error) {
        console.error(`Ошибка чтения ${filePath}:`, error);
        return fallback;
    }
}

function writeJson(filePath, data) {
    try {
        const tempFile = `${filePath}.tmp`;

        fs.writeFileSync(
            tempFile,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        fs.renameSync(tempFile, filePath);

        return true;
    } catch (error) {
        console.error(`Ошибка записи ${filePath}:`, error);
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
            typeof config.siteName === "string" && config.siteName.trim().length > 0
                ? config.siteName.trim()
                : DEFAULT_CONFIG.siteName
    };
}

function getAdminPassword() {
    return getConfig().password;
}

function getPasswordFromRequest(req) {
    const possiblePasswords = [
        req.headers["x-admin-password"],
        req.headers["x-password"],
        req.query.password,
        req.body && req.body.password
    ];

    for (const value of possiblePasswords) {
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }

    return "";
}

function isAdmin(req) {
    return getPasswordFromRequest(req) === getAdminPassword();
}

function requireAdmin(req, res, next) {
    if (!isAdmin(req)) {
        return res.status(401).json({
            success: false,
            error: "Неверный или отсутствующий пароль администратора."
        });
    }

    next();
}

function normalizePosts(posts) {
    if (!Array.isArray(posts)) {
        return [];
    }

    return posts.map((post) => {
        const normalized = {
            ...post,

            id:
                post.id !== undefined && post.id !== null
                    ? String(post.id)
                    : Date.now().toString(),

            title:
                typeof post.title === "string"
                    ? post.title
                    : "",

            platform:
                typeof post.platform === "string"
                    ? post.platform
                    : "",

            imageUrl:
                typeof post.imageUrl === "string"
                    ? post.imageUrl
                    : "",

            content:
                typeof post.content === "string"
                    ? post.content
                    : "",

            pinned: Boolean(post.pinned),

            isDraft: Boolean(post.isDraft),

            publishAt:
                typeof post.publishAt === "string"
                    ? post.publishAt
                    : "",

            moodTag:
                ["Слух", "Инсайд", "Официально", "Мнение"].includes(post.moodTag)
                    ? post.moodTag
                    : "",

            willPlay:
                Number.isFinite(Number(post.willPlay))
                    ? Number(post.willPlay)
                    : 0,

            wontPlay:
                Number.isFinite(Number(post.wontPlay))
                    ? Number(post.wontPlay)
                    : 0,

            createdAt:
                typeof post.createdAt === "string"
                    ? post.createdAt
                    : new Date().toISOString()
        };

        return normalized;
    });
}

function normalizeRelease(release) {
    return {
        ...release,

        id:
            release.id !== undefined && release.id !== null
                ? String(release.id)
                : Date.now().toString(),

        title:
            typeof release.title === "string"
                ? release.title
                : "",

        releaseDate:
            typeof release.releaseDate === "string"
                ? release.releaseDate
                : "",

        priceDigital:
            Number.isFinite(Number(release.priceDigital))
                ? Number(release.priceDigital)
                : 0,

        priceDisk:
            Number.isFinite(Number(release.priceDisk))
                ? Number(release.priceDisk)
                : 0,

        platforms:
            Array.isArray(release.platforms)
                ? release.platforms
                    .filter((platform) => platform === "PC" || platform === "PS")
                : [],

        systemReq:
            typeof release.systemReq === "string"
                ? release.systemReq
                : "Слабый ПК",

        bgUrl:
            typeof release.bgUrl === "string"
                ? release.bgUrl
                : "",

        discount:
            Number.isFinite(Number(release.discount))
                ? Math.max(0, Math.min(100, Number(release.discount)))
                : 0,

        isMainHit: Boolean(release.isMainHit),

        isArchived: Boolean(release.isArchived),

        votesWillPlay:
            Number.isFinite(Number(release.votesWillPlay))
                ? Number(release.votesWillPlay)
                : 0,

        votesWontPlay:
            Number.isFinite(Number(release.votesWontPlay))
                ? Number(release.votesWontPlay)
                : 0
    };
}

function normalizeQuizData(data) {
    const source =
        data && typeof data === "object"
            ? data
            : DEFAULT_QUIZ_DATA;

    const options = Array.isArray(source.options)
        ? source.options.slice(0, 3)
        : DEFAULT_QUIZ_DATA.options;

    while (options.length < 3) {
        options.push(`Вариант ${options.length + 1}`);
    }

    const pollSource =
        source.poll && typeof source.poll === "object"
            ? source.poll
            : DEFAULT_QUIZ_DATA.poll;

    const pollOptions = Array.isArray(pollSource.options)
        ? pollSource.options.slice(0, 3)
        : DEFAULT_QUIZ_DATA.poll.options;

    while (pollOptions.length < 3) {
        pollOptions.push({
            text: `Вариант ${pollOptions.length + 1}`,
            votes: 0
        });
    }

    return {
        question:
            typeof source.question === "string"
                ? source.question
                : DEFAULT_QUIZ_DATA.question,

        screenshotUrl:
            typeof source.screenshotUrl === "string"
                ? source.screenshotUrl
                : "",

        options: options.map((option) =>
            typeof option === "string"
                ? option
                : ""
        ),

        correctIndex:
            Number.isInteger(Number(source.correctIndex)) &&
            Number(source.correctIndex) >= 0 &&
            Number(source.correctIndex) < 3
                ? Number(source.correctIndex)
                : 0,

        poll: {
            topic:
                typeof pollSource.topic === "string"
                    ? pollSource.topic
                    : DEFAULT_QUIZ_DATA.poll.topic,

            options: pollOptions.map((option) => ({
                text:
                    option &&
                    typeof option.text === "string"
                        ? option.text
                        : "",

                votes:
                    option &&
                    Number.isFinite(Number(option.votes))
                        ? Number(option.votes)
                        : 0
            }))
        }
    };
}

function getPosts() {
    const posts = readJson(POSTS_FILE, []);

    return normalizePosts(posts);
}

function getReleases() {
    const releases = readJson(RELEASES_FILE, []);

    if (!Array.isArray(releases)) {
        return [];
    }

    return releases.map(normalizeRelease);
}

function getQuizData() {
    return normalizeQuizData(
        readJson(QUIZ_FILE, DEFAULT_QUIZ_DATA)
    );
}

function savePosts(posts) {
    return writeJson(
        POSTS_FILE,
        normalizePosts(posts)
    );
}

function saveReleases(releases) {
    return writeJson(
        RELEASES_FILE,
        releases.map(normalizeRelease)
    );
}

function saveQuizData(data) {
    return writeJson(
        QUIZ_FILE,
        normalizeQuizData(data)
    );
}

function sortPosts(posts) {
    return [...posts].sort((a, b) => {
        if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
        }

        const aDate = new Date(a.createdAt).getTime() || 0;
        const bDate = new Date(b.createdAt).getTime() || 0;

        return bDate - aDate;
    });
}

function isPublished(post, now = Date.now()) {
    if (post.isDraft === true) {
        return false;
    }

    if (post.publishAt) {
        const publishTime = new Date(post.publishAt).getTime();

        if (Number.isFinite(publishTime) && publishTime > now) {
            return false;
        }
    }

    return true;
}

function getPublishedPosts(posts) {
    const now = Date.now();

    return posts.filter((post) => isPublished(post, now));
}

function validateMoodTag(moodTag) {
    return [
        "",
        "Слух",
        "Инсайд",
        "Официально",
        "Мнение"
    ].includes(moodTag);
}

function parseBoolean(value, defaultValue = false) {
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

    return defaultValue;
}

function parseNumber(value, defaultValue = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : defaultValue;
}

function getNextId() {
    return Date.now().toString();
}

ensureJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
ensureJsonFile(POSTS_FILE, []);
ensureJsonFile(RELEASES_FILE, []);
ensureJsonFile(QUIZ_FILE, DEFAULT_QUIZ_DATA);

/* =========================
   HEALTH
========================= */

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "ok",
        siteName: getConfig().siteName,
        timestamp: new Date().toISOString()
    });
});

/* =========================
   CONFIG
========================= */

app.get("/api/config", (req, res) => {
    const config = getConfig();

    res.json({
        siteName: config.siteName
    });
});

app.post("/api/admin/config", requireAdmin, (req, res) => {
    const currentConfig = getConfig();

    const hasPasswordField =
        Object.prototype.hasOwnProperty.call(req.body || {}, "newPassword") ||
        Object.prototype.hasOwnProperty.call(req.body || {}, "password") ||
        Object.prototype.hasOwnProperty.call(req.body || {}, "adminPassword");

    const hasSiteNameField =
        Object.prototype.hasOwnProperty.call(req.body || {}, "siteName");

    let newPassword = currentConfig.password;

    if (hasPasswordField) {
        const requestedPassword =
            req.body.newPassword ??
            req.body.adminPassword ??
            req.body.password;

        if (
            typeof requestedPassword !== "string" ||
            requestedPassword.trim().length < 1
        ) {
            return res.status(400).json({
                success: false,
                error: "Новый пароль не может быть пустым."
            });
        }

        newPassword = requestedPassword.trim();
    }

    let newSiteName = currentConfig.siteName;

    if (hasSiteNameField) {
        if (
            typeof req.body.siteName !== "string" ||
            req.body.siteName.trim().length < 1
        ) {
            return res.status(400).json({
                success: false,
                error: "Название сайта не может быть пустым."
            });
        }

        newSiteName = req.body.siteName.trim();
    }

    const updatedConfig = {
        password: newPassword,
        siteName: newSiteName
    };

    if (!writeJson(CONFIG_FILE, updatedConfig)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить конфигурацию."
        });
    }

    res.json({
        success: true,
        siteName: updatedConfig.siteName
    });
});

/* =========================
   POSTS
========================= */

app.get("/api/posts", (req, res) => {
    const posts = getPosts();

    if (isAdmin(req)) {
        return res.json(sortPosts(posts));
    }

    const visiblePosts = getPublishedPosts(posts);

    return res.json(sortPosts(visiblePosts));
});

app.post("/api/posts", requireAdmin, (req, res) => {
    const posts = getPosts();

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
            error: "Название новости обязательно."
        });
    }

    if (!content.trim()) {
        return res.status(400).json({
            success: false,
            error: "Текст новости обязателен."
        });
    }

    const moodTag =
        typeof body.moodTag === "string"
            ? body.moodTag.trim()
            : "";

    if (!validateMoodTag(moodTag)) {
        return res.status(400).json({
            success: false,
            error: "Недопустимый moodTag."
        });
    }

    let publishAt = "";

    if (typeof body.publishAt === "string") {
        publishAt = body.publishAt.trim();

        if (publishAt) {
            const publishTimestamp = new Date(publishAt).getTime();

            if (!Number.isFinite(publishTimestamp)) {
                return res.status(400).json({
                    success: false,
                    error: "Некорректная дата publishAt."
                });
            }
        }
    }

    const post = {
        id: getNextId(),
        title,
        platform:
            typeof body.platform === "string"
                ? body.platform.trim()
                : "",
        imageUrl:
            typeof body.imageUrl === "string"
                ? body.imageUrl.trim()
                : "",
        content,
        pinned: parseBoolean(body.pinned, false),
        isDraft: parseBoolean(body.isDraft, false),
        publishAt,
        moodTag,
        willPlay: 0,
        wontPlay: 0,
        createdAt: new Date().toISOString()
    };

    posts.push(post);

    if (!savePosts(posts)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить новость."
        });
    }

    res.status(201).json({
        success: true,
        post
    });
});

app.patch("/api/posts/:id", requireAdmin, (req, res) => {
    const posts = getPosts();

    const index = posts.findIndex(
        (post) => String(post.id) === String(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Новость не найдена."
        });
    }

    const existing = posts[index];
    const body = req.body || {};

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
        if (
            typeof body.title !== "string" ||
            !body.title.trim()
        ) {
            return res.status(400).json({
                success: false,
                error: "Название новости не может быть пустым."
            });
        }

        existing.title = body.title.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, "content")) {
        if (
            typeof body.content !== "string" ||
            !body.content.trim()
        ) {
            return res.status(400).json({
                success: false,
                error: "Текст новости не может быть пустым."
            });
        }

        existing.content = body.content;
    }

    if (Object.prototype.hasOwnProperty.call(body, "platform")) {
        existing.platform =
            typeof body.platform === "string"
                ? body.platform.trim()
                : "";
    }

    if (Object.prototype.hasOwnProperty.call(body, "imageUrl")) {
        existing.imageUrl =
            typeof body.imageUrl === "string"
                ? body.imageUrl.trim()
                : "";
    }

    if (Object.prototype.hasOwnProperty.call(body, "pinned")) {
        existing.pinned = parseBoolean(body.pinned, false);
    }

    if (Object.prototype.hasOwnProperty.call(body, "isDraft")) {
        existing.isDraft = parseBoolean(body.isDraft, false);
    }

    if (Object.prototype.hasOwnProperty.call(body, "publishAt")) {
        const publishAt =
            typeof body.publishAt === "string"
                ? body.publishAt.trim()
                : "";

        if (publishAt) {
            const publishTimestamp = new Date(publishAt).getTime();

            if (!Number.isFinite(publishTimestamp)) {
                return res.status(400).json({
                    success: false,
                    error: "Некорректная дата publishAt."
                });
            }
        }

        existing.publishAt = publishAt;
    }

    if (Object.prototype.hasOwnProperty.call(body, "moodTag")) {
        const moodTag =
            typeof body.moodTag === "string"
                ? body.moodTag.trim()
                : "";

        if (!validateMoodTag(moodTag)) {
            return res.status(400).json({
                success: false,
                error: "Недопустимый moodTag."
            });
        }

        existing.moodTag = moodTag;
    }

    posts[index] = normalizePosts([existing])[0];

    if (!savePosts(posts)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось обновить новость."
        });
    }

    res.json({
        success: true,
        post: posts[index]
    });
});

app.post("/api/posts/:id/vote", (req, res) => {
    const posts = getPosts();

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
        typeof req.body?.type === "string"
            ? req.body.type.trim()
            : "";

    if (type !== "willPlay" && type !== "wontPlay") {
        return res.status(400).json({
            success: false,
            error: "Тип голоса должен быть willPlay или wontPlay."
        });
    }

    if (type === "willPlay") {
        posts[index].willPlay += 1;
    } else {
        posts[index].wontPlay += 1;
    }

    if (!savePosts(posts)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить голос."
        });
    }

    res.json({
        success: true,
        willPlay: posts[index].willPlay,
        wontPlay: posts[index].wontPlay
    });
});

app.delete("/api/posts/:id", requireAdmin, (req, res) => {
    const posts = getPosts();

    const index = posts.findIndex(
        (post) => String(post.id) === String(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Новость не найдена."
        });
    }

    const deletedPost = posts.splice(index, 1)[0];

    if (!savePosts(posts)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось удалить новость."
        });
    }

    res.json({
        success: true,
        deleted: deletedPost
    });
});

/* =========================
   RELEASES
========================= */

app.get("/api/releases", (req, res) => {
    const releases = getReleases();

    const activeReleases = releases.filter(
        (release) => release.isArchived === false
    );

    saveReleases(releases);

    res.json(activeReleases);
});

app.get("/api/releases/archive", (req, res) => {
    const releases = getReleases();

    const archivedReleases = releases.filter(
        (release) => release.isArchived === true
    );

    res.json(archivedReleases);
});

app.post("/api/releases", requireAdmin, (req, res) => {
    const releases = getReleases();
    const body = req.body || {};

    const title =
        typeof body.title === "string"
            ? body.title.trim()
            : "";

    const releaseDate =
        typeof body.releaseDate === "string"
            ? body.releaseDate.trim()
            : "";

    if (!title) {
        return res.status(400).json({
            success: false,
            error: "Название игры обязательно."
        });
    }

    if (!releaseDate) {
        return res.status(400).json({
            success: false,
            error: "Дата выхода обязательна."
        });
    }

    const parsedReleaseDate = new Date(releaseDate).getTime();

    if (!Number.isFinite(parsedReleaseDate)) {
        return res.status(400).json({
            success: false,
            error: "Некорректная дата выхода."
        });
    }

    let platforms = [];

    if (Array.isArray(body.platforms)) {
        platforms = body.platforms.filter(
            (platform) => platform === "PC" || platform === "PS"
        );
    } else if (typeof body.platforms === "string") {
        platforms = body.platforms
            .split(",")
            .map((platform) => platform.trim())
            .filter(
                (platform) =>
                    platform === "PC" ||
                    platform === "PS"
            );
    }

    const discount = Math.max(
        0,
        Math.min(
            100,
            parseNumber(body.discount, 0)
        )
    );

    const release = {
        id: getNextId(),
        title,
        releaseDate,
        priceDigital: Math.max(
            0,
            parseNumber(body.priceDigital, 0)
        ),
        priceDisk: Math.max(
            0,
            parseNumber(body.priceDisk, 0)
        ),
        platforms,
        systemReq:
            typeof body.systemReq === "string" &&
            body.systemReq.trim()
                ? body.systemReq.trim()
                : "Слабый ПК",
        bgUrl:
            typeof body.bgUrl === "string"
                ? body.bgUrl.trim()
                : "",
        discount,
        isMainHit: parseBoolean(body.isMainHit, false),
        isArchived: parseBoolean(body.isArchived, false),
        votesWillPlay: 0,
        votesWontPlay: 0
    };

    releases.push(release);

    if (!saveReleases(releases)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить релиз."
        });
    }

    res.status(201).json({
        success: true,
        release
    });
});

app.patch("/api/releases/:id/archive", requireAdmin, (req, res) => {
    const releases = getReleases();

    const index = releases.findIndex(
        (release) => String(release.id) === String(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Релиз не найден."
        });
    }

    releases[index].isArchived =
        !releases[index].isArchived;

    if (!saveReleases(releases)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось изменить статус архива."
        });
    }

    res.json({
        success: true,
        release: releases[index]
    });
});

app.post("/api/releases/:id/vote", (req, res) => {
    const releases = getReleases();

    const index = releases.findIndex(
        (release) => String(release.id) === String(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Релиз не найден."
        });
    }

    if (releases[index].isArchived) {
        return res.status(400).json({
            success: false,
            error: "Архивные игры больше не принимают голоса."
        });
    }

    const type =
        typeof req.body?.type === "string"
            ? req.body.type.trim()
            : "";

    if (
        type !== "willPlay" &&
        type !== "wontPlay"
    ) {
        return res.status(400).json({
            success: false,
            error: "Тип голоса должен быть willPlay или wontPlay."
        });
    }

    if (type === "willPlay") {
        releases[index].votesWillPlay += 1;
    } else {
        releases[index].votesWontPlay += 1;
    }

    if (!saveReleases(releases)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить голос."
        });
    }

    res.json({
        success: true,
        votesWillPlay: releases[index].votesWillPlay,
        votesWontPlay: releases[index].votesWontPlay,
        willPlay: releases[index].votesWillPlay,
        wontPlay: releases[index].votesWontPlay
    });
});

app.delete("/api/releases/:id", requireAdmin, (req, res) => {
    const releases = getReleases();

    const index = releases.findIndex(
        (release) => String(release.id) === String(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: "Релиз не найден."
        });
    }

    const deletedRelease = releases.splice(index, 1)[0];

    if (!saveReleases(releases)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось удалить релиз."
        });
    }

    res.json({
        success: true,
        deleted: deletedRelease
    });
});

/* =========================
   QUIZ
========================= */

app.get("/api/quiz", (req, res) => {
    const quiz = getQuizData();

    res.json({
        question: quiz.question,
        screenshotUrl: quiz.screenshotUrl,
        options: quiz.options
    });
});

app.post("/api/quiz/manage", requireAdmin, (req, res) => {
    const quiz = getQuizData();
    const body = req.body || {};

    if (
        Object.prototype.hasOwnProperty.call(body, "question")
    ) {
        if (
            typeof body.question !== "string" ||
            !body.question.trim()
        ) {
            return res.status(400).json({
                success: false,
                error: "Вопрос викторины не может быть пустым."
            });
        }

        quiz.question = body.question.trim();
    }

    if (
        Object.prototype.hasOwnProperty.call(body, "screenshotUrl")
    ) {
        quiz.screenshotUrl =
            typeof body.screenshotUrl === "string"
                ? body.screenshotUrl.trim()
                : "";
    }

    if (
        Object.prototype.hasOwnProperty.call(body, "options")
    ) {
        if (!Array.isArray(body.options)) {
            return res.status(400).json({
                success: false,
                error: "options должен быть массивом."
            });
        }

        if (body.options.length !== 3) {
            return res.status(400).json({
                success: false,
                error: "В викторине должно быть ровно 3 варианта."
            });
        }

        if (
            body.options.some(
                (option) =>
                    typeof option !== "string" ||
                    !option.trim()
            )
        ) {
            return res.status(400).json({
                success: false,
                error: "Все варианты ответов должны быть заполнены."
            });
        }

        quiz.options = body.options.map(
            (option) => option.trim()
        );
    }

    if (
        Object.prototype.hasOwnProperty.call(body, "correctIndex")
    ) {
        const correctIndex = Number(body.correctIndex);

        if (
            !Number.isInteger(correctIndex) ||
            correctIndex < 0 ||
            correctIndex > 2
        ) {
            return res.status(400).json({
                success: false,
                error: "correctIndex должен быть 0, 1 или 2."
            });
        }

        quiz.correctIndex = correctIndex;
    }

    if (!saveQuizData(quiz)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить викторину."
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
    const quiz = getQuizData();

    const answerIndex = Number(
        req.body?.answerIndex
    );

    if (
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex > 2
    ) {
        return res.status(400).json({
            success: false,
            error: "answerIndex должен быть 0, 1 или 2."
        });
    }

    const correct =
        answerIndex === quiz.correctIndex;

    res.json({
        success: true,
        correct,
        correctIndex: quiz.correctIndex
    });
});

/* =========================
   POLL
========================= */

app.get("/api/poll", (req, res) => {
    const quiz = getQuizData();

    res.json({
        topic: quiz.poll.topic,
        options: quiz.poll.options
    });
});

app.post("/api/poll/vote", (req, res) => {
    const quiz = getQuizData();

    const answerIndex = Number(
        req.body?.answerIndex ??
        req.body?.optionIndex ??
        req.body?.index
    );

    if (
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= quiz.poll.options.length
    ) {
        return res.status(400).json({
            success: false,
            error: "Некорректный индекс варианта опроса."
        });
    }

    quiz.poll.options[answerIndex].votes += 1;

    if (!saveQuizData(quiz)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить голос опроса."
        });
    }

    res.json({
        success: true,
        topic: quiz.poll.topic,
        options: quiz.poll.options,
        selectedIndex: answerIndex
    });
});

app.post("/api/poll/manage", requireAdmin, (req, res) => {
    const quiz = getQuizData();
    const body = req.body || {};

    if (
        Object.prototype.hasOwnProperty.call(body, "topic")
    ) {
        if (
            typeof body.topic !== "string" ||
            !body.topic.trim()
        ) {
            return res.status(400).json({
                success: false,
                error: "Тема опроса не может быть пустой."
            });
        }

        quiz.poll.topic = body.topic.trim();
    }

    if (
        Object.prototype.hasOwnProperty.call(body, "options")
    ) {
        if (!Array.isArray(body.options)) {
            return res.status(400).json({
                success: false,
                error: "options должен быть массивом."
            });
        }

        if (body.options.length !== 3) {
            return res.status(400).json({
                success: false,
                error: "В опросе должно быть ровно 3 варианта."
            });
        }

        const normalizedOptions = body.options.map(
            (option) => {
                if (typeof option === "string") {
                    return {
                        text: option.trim(),
                        votes: 0
                    };
                }

                return {
                    text:
                        typeof option?.text === "string"
                            ? option.text.trim()
                            : "",
                    votes:
                        Number.isFinite(Number(option?.votes))
                            ? Math.max(0, Number(option.votes))
                            : 0
                };
            }
        );

        if (
            normalizedOptions.some(
                (option) => !option.text
            )
        ) {
            return res.status(400).json({
                success: false,
                error: "Все варианты опроса должны быть заполнены."
            });
        }

        quiz.poll.options = normalizedOptions;
    }

    if (
        Object.prototype.hasOwnProperty.call(body, "resetVotes") &&
        parseBoolean(body.resetVotes, false)
    ) {
        quiz.poll.options =
            quiz.poll.options.map((option) => ({
                text: option.text,
                votes: 0
            }));
    }

    if (!saveQuizData(quiz)) {
        return res.status(500).json({
            success: false,
            error: "Не удалось сохранить опрос."
        });
    }

    res.json({
        success: true,
        poll: quiz.poll
    });
});

/* =========================
   ADMIN: CLEAR ALL
========================= */

app.post("/api/admin/clear-all", requireAdmin, (req, res) => {
    const postsCleared = writeJson(
        POSTS_FILE,
        []
    );

    const releasesCleared = writeJson(
        RELEASES_FILE,
        []
    );

    if (!postsCleared || !releasesCleared) {
        return res.status(500).json({
            success: false,
            error: "Не удалось полностью очистить систему."
        });
    }

    res.json({
        success: true,
        message: "Все новости и релизы полностью очищены.",
        posts: [],
        releases: []
    });
});

/* =========================
   404 API
========================= */

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        error: "API маршрут не найден."
    });
});

/* =========================
   SPA FALLBACK
========================= */

app.use((req, res, next) => {
    if (req.method !== "GET") {
        return next();
    }

    if (req.path.startsWith("/api/")) {
        return next();
    }

    const indexPath = path.join(
        PUBLIC_DIR,
        "index.html"
    );

    if (!fs.existsSync(indexPath)) {
        return res.status(404).send("index.html не найден.");
    }

    res.sendFile(indexPath);
});

/* =========================
   ERROR HANDLER
========================= */

app.use((error, req, res, next) => {
    console.error("Необработанная ошибка:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Внутренняя ошибка сервера."
    });
});

/* =========================
   SERVER START
========================= */

app.listen(PORT, "0.0.0.0", () => {
    console.log(`PlayPC server запущен на порту ${PORT}`);
    console.log(`Статика: ${PUBLIC_DIR}`);
    console.log(`Конфигурация: ${CONFIG_FILE}`);
    console.log(`Посты: ${POSTS_FILE}`);
    console.log(`Релизы: ${RELEASES_FILE}`);
    console.log(`Викторина и опрос: ${QUIZ_FILE}`);
});