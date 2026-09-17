const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const app = express();

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const POSTS_FILE = path.join(ROOT_DIR, "posts.json");
const RELEASES_FILE = path.join(ROOT_DIR, "releases.json");
const CONFIG_FILE = path.join(ROOT_DIR, "config.json");
const QUIZ_FILE = path.join(ROOT_DIR, "quiz.json");
const POLL_FILE = path.join(ROOT_DIR, "poll.json");

const DEFAULT_ADMIN_PASSWORD = "AdminPlayPC2026";

const DEFAULT_FOOTER_TEXT =
    "Юридическая информация • Сентябрь 2026 \n" +
    "PlayPC в рамках функций данного интерфейса не использует cookies и не собирает персональные данные пользователей. " +
    "Данные не передаются третьим лицам через пользовательский интерфейс сайта. " +
    "Эксплуатация проекта должна осуществляться с учётом применимого законодательства Российской Федерации и Азербайджанской Республики.";

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(PUBLIC_DIR));

function ensureJsonFile(filePath, defaultValue) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(
            filePath,
            JSON.stringify(defaultValue, null, 2),
            "utf8"
        );
    }
}

function readJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) {
            ensureJsonFile(filePath, fallback);
            return fallback;
        }

        const raw = fs.readFileSync(filePath, "utf8");

        if (!raw.trim()) {
            fs.writeFileSync(
                filePath,
                JSON.stringify(fallback, null, 2),
                "utf8"
            );
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(`Ошибка чтения ${path.basename(filePath)}:`, error);
        return fallback;
    }
}

function writeJson(filePath, data) {
    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

function ensureFiles() {
    ensureJsonFile(POSTS_FILE, []);
    ensureJsonFile(RELEASES_FILE, []);

    ensureJsonFile(CONFIG_FILE, {
        password: DEFAULT_ADMIN_PASSWORD,
        siteName: "PlayPC",
        musicPlaylist: [],
        footerText: DEFAULT_FOOTER_TEXT
    });

    ensureJsonFile(QUIZ_FILE, {
        question: "Угадай игру",
        options: [],
        correctIndex: 0,
        imageUrl: ""
    });

    ensureJsonFile(POLL_FILE, {
        question: "",
        options: [],
        votes: []
    });

    const config = readJson(CONFIG_FILE, {
        password: DEFAULT_ADMIN_PASSWORD,
        siteName: "PlayPC",
        musicPlaylist: [],
        footerText: DEFAULT_FOOTER_TEXT
    });

    let changed = false;

    if (typeof config.password !== "string" || !config.password) {
        config.password = DEFAULT_ADMIN_PASSWORD;
        changed = true;
    }

    if (typeof config.siteName !== "string" || !config.siteName) {
        config.siteName = "PlayPC";
        changed = true;
    }

    if (!Array.isArray(config.musicPlaylist)) {
        config.musicPlaylist = [];
        changed = true;
    }

    if (typeof config.footerText !== "string") {
        config.footerText = DEFAULT_FOOTER_TEXT;
        changed = true;
    }

    if (changed) {
        writeJson(CONFIG_FILE, config);
    }
}

ensureFiles();

function getConfig() {
    const config = readJson(CONFIG_FILE, {
        password: DEFAULT_ADMIN_PASSWORD,
        siteName: "PlayPC",
        musicPlaylist: [],
        footerText: DEFAULT_FOOTER_TEXT
    });

    if (typeof config.footerText !== "string") {
        config.footerText = DEFAULT_FOOTER_TEXT;
    }

    if (!Array.isArray(config.musicPlaylist)) {
        config.musicPlaylist = [];
    }

    return config;
}

function getAdminPasswordFromRequest(req) {
    const headerPassword =
        req.headers["x-admin-password"] ||
        req.headers["x-password"];

    if (headerPassword) {
        return String(headerPassword);
    }

    if (req.query && req.query.password) {
        return String(req.query.password);
    }

    if (req.body && req.body.password) {
        return String(req.body.password);
    }

    return "";
}

function isAdmin(req) {
    const config = getConfig();
    const providedPassword = getAdminPasswordFromRequest(req);

    return (
        typeof providedPassword === "string" &&
        providedPassword.length > 0 &&
        providedPassword === String(config.password)
    );
}

function requireAdmin(req, res, next) {
    if (!isAdmin(req)) {
        return res.status(401).json({
            success: false,
            error: "Требуется пароль администратора"
        });
    }

    next();
}

function generateId(prefix = "") {
    return (
        prefix +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 8)
    );
}

function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}

function normalizeBoolean(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}

function syncWithGitHub() {
    try {
        execSync(
            'git config user.name "PlayPC Bot"',
            {
                cwd: ROOT_DIR,
                stdio: "ignore"
            }
        );

        execSync(
            'git config user.email "playpc-bot@users.noreply.github.com"',
            {
                cwd: ROOT_DIR,
                stdio: "ignore"
            }
        );

        execSync(
            "git add posts.json releases.json config.json quiz.json poll.json",
            {
                cwd: ROOT_DIR,
                stdio: "ignore"
            }
        );

        try {
            execSync(
                'git commit -m "PlayPC automatic data update"',
                {
                    cwd: ROOT_DIR,
                    stdio: "ignore"
                }
            );
        } catch (commitError) {
            console.log("Git commit: изменений для коммита нет.");
        }

        if (process.env.PORT) {
            try {
                execSync(
                    "git push origin main",
                    {
                        cwd: ROOT_DIR,
                        stdio: "ignore"
                    }
                );

                console.log("GitHub: изменения успешно отправлены.");
            } catch (pushError) {
                console.error(
                    "GitHub push не выполнен:",
                    pushError.message
                );
            }
        } else {
            console.log(
                "Локальный запуск: git push пропущен."
            );
        }
    } catch (error) {
        console.error(
            "Ошибка автосохранения GitHub:",
            error.message
        );
    }
}

function saveAndSync(filePath, data) {
    writeJson(filePath, data);
    syncWithGitHub();
}

function publicPost(post) {
    const copy = { ...post };

    if (!copy.analytics || typeof copy.analytics !== "object") {
        copy.analytics = {};
    }

    copy.analytics = {
        share: normalizeNumber(copy.analytics.share),
        bookmark: normalizeNumber(copy.analytics.bookmark),
        like: normalizeNumber(copy.analytics.like),
        dislike: normalizeNumber(copy.analytics.dislike),
        views: normalizeNumber(copy.analytics.views)
    };

    copy.votes = {
        like: normalizeNumber(
            copy.votes && copy.votes.like,
            normalizeNumber(copy.likes)
        ),
        dislike: normalizeNumber(
            copy.votes && copy.votes.dislike,
            normalizeNumber(copy.dislikes)
        )
    };

    return copy;
}

function isPostVisible(post) {
    if (normalizeBoolean(post.isDraft)) {
        return false;
    }

    if (!post.publishAt) {
        return true;
    }

    const publishTime = new Date(post.publishAt).getTime();

    if (!Number.isFinite(publishTime)) {
        return true;
    }

    return publishTime <= Date.now();
}

function getPostsForPublic() {
    const posts = readJson(POSTS_FILE, []);

    return normalizeArray(posts)
        .filter(isPostVisible)
        .sort((a, b) => {
            const dateA = new Date(
                a.publishAt || a.createdAt || 0
            ).getTime();

            const dateB = new Date(
                b.publishAt || b.createdAt || 0
            ).getTime();

            return dateB - dateA;
        })
        .map(publicPost);
}

function getAllPosts() {
    const posts = readJson(POSTS_FILE, []);

    return normalizeArray(posts).map(publicPost);
}

function getReleases() {
    return normalizeArray(
        readJson(RELEASES_FILE, [])
    );
}

function getPublicReleases() {
    return getReleases()
        .filter((release) => !normalizeBoolean(release.archived))
        .sort((a, b) => {
            const dateA = new Date(
                a.releaseDate || a.date || 0
            ).getTime();

            const dateB = new Date(
                b.releaseDate || b.date || 0
            ).getTime();

            return dateA - dateB;
        });
}

function getPublicQuiz() {
    const quiz = readJson(QUIZ_FILE, {
        question: "Угадай игру",
        options: [],
        correctIndex: 0,
        imageUrl: ""
    });

    return {
        question: quiz.question || "Угадай игру",
        options: normalizeArray(quiz.options),
        imageUrl: quiz.imageUrl || ""
    };
}

function getPoll() {
    const poll = readJson(POLL_FILE, {
        question: "",
        options: [],
        votes: []
    });

    const options = normalizeArray(poll.options).map(
        (option, index) => {
            if (typeof option === "string") {
                return {
                    id: String(index),
                    text: option
                };
            }

            return {
                id: String(option.id ?? index),
                text: String(
                    option.text ??
                    option.title ??
                    option.label ??
                    ""
                ),
                votes: normalizeNumber(option.votes)
            };
        }
    );

    const votes = normalizeArray(poll.votes);

    const totalVotes = options.reduce(
        (sum, option) =>
            sum + normalizeNumber(option.votes),
        0
    );

    return {
        question: String(
            poll.question ||
            poll.topic ||
            "Опрос готовится к запуску"
        ),
        options: options.map((option) => ({
            ...option,
            votes: normalizeNumber(option.votes),
            percentage:
                totalVotes > 0
                    ? Math.round(
                        (normalizeNumber(option.votes) /
                            totalVotes) *
                        100
                    )
                    : 0
        })),
        totalVotes
    };
}

app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

/* =========================================================
   CONFIG
========================================================= */

app.get("/api/config", (req, res) => {
    const config = getConfig();

    res.json({
        siteName: config.siteName || "PlayPC",
        musicPlaylist: normalizeArray(config.musicPlaylist),
        footerText:
            typeof config.footerText === "string"
                ? config.footerText
                : DEFAULT_FOOTER_TEXT
    });
});

app.post(
    "/api/admin/config",
    requireAdmin,
    (req, res) => {
        const config = getConfig();

        if (
            Object.prototype.hasOwnProperty.call(
                req.body,
                "siteName"
            )
        ) {
            const siteName = String(
                req.body.siteName ?? ""
            ).trim();

            if (siteName) {
                config.siteName = siteName;
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(
                req.body,
                "footerText"
            )
        ) {
            config.footerText = String(
                req.body.footerText ?? ""
            );
        }

        if (
            Object.prototype.hasOwnProperty.call(
                req.body,
                "musicPlaylist"
            ) &&
            Array.isArray(req.body.musicPlaylist)
        ) {
            config.musicPlaylist =
                req.body.musicPlaylist;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                req.body,
                "newPassword"
            )
        ) {
            const newPassword = String(
                req.body.newPassword ?? ""
            ).trim();

            if (newPassword) {
                config.password = newPassword;
            }
        }

        writeJson(CONFIG_FILE, config);
        syncWithGitHub();

        res.json({
            success: true,
            message: "Конфигурация сохранена",
            config: {
                siteName: config.siteName,
                musicPlaylist: config.musicPlaylist,
                footerText: config.footerText
            }
        });
    }
);

app.post(
    "/api/config/manage",
    requireAdmin,
    (req, res) => {
        const config = getConfig();

        if (
            Object.prototype.hasOwnProperty.call(
                req.body,
                "siteName"
            )
        ) {
            const siteName = String(
                req.body.siteName ?? ""
            ).trim();

            if (siteName) {
                config.siteName = siteName;
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(
                req.body,
                "footerText"
            )
        ) {
            config.footerText = String(
                req.body.footerText ?? ""
            );
        }

        if (
            Object.prototype.hasOwnProperty.call(
                req.body,
                "musicPlaylist"
            ) &&
            Array.isArray(req.body.musicPlaylist)
        ) {
            config.musicPlaylist =
                req.body.musicPlaylist;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                req.body,
                "newPassword"
            )
        ) {
            const newPassword = String(
                req.body.newPassword ?? ""
            ).trim();

            if (newPassword) {
                config.password = newPassword;
            }
        }

        writeJson(CONFIG_FILE, config);
        syncWithGitHub();

        res.json({
            success: true,
            message: "Конфигурация сохранена",
            config: {
                siteName: config.siteName,
                musicPlaylist: config.musicPlaylist,
                footerText: config.footerText
            }
        });
    }
);

/* =========================================================
   MUSIC
========================================================= */

app.get("/api/music", (req, res) => {
    const config = getConfig();

    res.json({
        musicPlaylist: normalizeArray(
            config.musicPlaylist
        )
    });
});

app.post(
    "/api/music/manage",
    requireAdmin,
    (req, res) => {
        const config = getConfig();

        if (!Array.isArray(req.body.musicPlaylist)) {
            return res.status(400).json({
                success: false,
                error: "musicPlaylist должен быть массивом"
            });
        }

        config.musicPlaylist =
            req.body.musicPlaylist;

        writeJson(CONFIG_FILE, config);
        syncWithGitHub();

        res.json({
            success: true,
            musicPlaylist: config.musicPlaylist
        });
    }
);

app.delete(
    "/api/admin/music/:id",
    requireAdmin,
    (req, res) => {
        const config = getConfig();

        const id = String(req.params.id);

        const oldPlaylist =
            normalizeArray(config.musicPlaylist);

        const newPlaylist = oldPlaylist.filter(
            (track) =>
                String(
                    track &&
                    typeof track === "object"
                        ? track.id
                        : ""
                ) !== id
        );

        if (
            newPlaylist.length === oldPlaylist.length
        ) {
            return res.status(404).json({
                success: false,
                error: "Трек не найден"
            });
        }

        config.musicPlaylist = newPlaylist;

        writeJson(CONFIG_FILE, config);
        syncWithGitHub();

        res.json({
            success: true,
            message: "Трек удалён",
            musicPlaylist: newPlaylist
        });
    }
);

/* =========================================================
   POSTS / NEWS
========================================================= */

app.get("/api/posts", (req, res) => {
    const adminPassword =
        getAdminPasswordFromRequest(req);

    const config = getConfig();

    if (
        adminPassword &&
        adminPassword === String(config.password)
    ) {
        return res.json(getAllPosts());
    }

    res.json(getPostsForPublic());
});

app.post(
    "/api/posts",
    requireAdmin,
    (req, res) => {
        const posts = readJson(POSTS_FILE, []);

        const now = new Date().toISOString();

        const post = {
            id: req.body.id || generateId("post_"),
            title: String(req.body.title || "Без названия"),
            platform: String(req.body.platform || ""),
            imageUrl: String(req.body.imageUrl || ""),
            content: String(req.body.content || ""),
            moodTag: String(req.body.moodTag || ""),
            isDraft: normalizeBoolean(req.body.isDraft),
            publishAt:
                req.body.publishAt
                    ? String(req.body.publishAt)
                    : "",
            pinned: normalizeBoolean(req.body.pinned),
            createdAt: now,
            updatedAt: now,
            analytics: {
                share: 0,
                bookmark: 0,
                like: 0,
                dislike: 0,
                views: 0
            },
            votes: {
                like: 0,
                dislike: 0
            }
        };

        posts.push(post);

        saveAndSync(POSTS_FILE, posts);

        res.status(201).json({
            success: true,
            post: publicPost(post)
        });
    }
);

app.put(
    "/api/posts/:id",
    requireAdmin,
    (req, res) => {
        const posts = readJson(POSTS_FILE, []);

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

        const oldPost = posts[index];

        const analytics =
            oldPost.analytics &&
            typeof oldPost.analytics === "object"
                ? oldPost.analytics
                : {};

        const votes =
            oldPost.votes &&
            typeof oldPost.votes === "object"
                ? oldPost.votes
                : {};

        const updatedPost = {
            ...oldPost,

            title:
                req.body.title !== undefined
                    ? String(req.body.title)
                    : oldPost.title,

            platform:
                req.body.platform !== undefined
                    ? String(req.body.platform)
                    : oldPost.platform,

            imageUrl:
                req.body.imageUrl !== undefined
                    ? String(req.body.imageUrl)
                    : oldPost.imageUrl,

            content:
                req.body.content !== undefined
                    ? String(req.body.content)
                    : oldPost.content,

            moodTag:
                req.body.moodTag !== undefined
                    ? String(req.body.moodTag)
                    : oldPost.moodTag,

            isDraft:
                req.body.isDraft !== undefined
                    ? normalizeBoolean(req.body.isDraft)
                    : normalizeBoolean(oldPost.isDraft),

            publishAt:
                req.body.publishAt !== undefined
                    ? String(req.body.publishAt)
                    : oldPost.publishAt,

            pinned:
                req.body.pinned !== undefined
                    ? normalizeBoolean(req.body.pinned)
                    : normalizeBoolean(oldPost.pinned),

            updatedAt: new Date().toISOString(),

            analytics: {
                share: normalizeNumber(analytics.share),
                bookmark: normalizeNumber(analytics.bookmark),
                like: normalizeNumber(analytics.like),
                dislike: normalizeNumber(analytics.dislike),
                views: normalizeNumber(analytics.views)
            },

            votes: {
                like: normalizeNumber(votes.like),
                dislike: normalizeNumber(votes.dislike)
            }
        };

        delete updatedPost.password;

        posts[index] = updatedPost;

        saveAndSync(POSTS_FILE, posts);

        res.json({
            success: true,
            post: publicPost(updatedPost)
        });
    }
);

app.delete(
    "/api/posts/:id",
    requireAdmin,
    (req, res) => {
        const posts = readJson(POSTS_FILE, []);

        const id = String(req.params.id);

        const newPosts = posts.filter(
            (post) => String(post.id) !== id
        );

        if (newPosts.length === posts.length) {
            return res.status(404).json({
                success: false,
                error: "Новость не найдена"
            });
        }

        saveAndSync(POSTS_FILE, newPosts);

        res.json({
            success: true,
            message: "Новость удалена"
        });
    }
);

app.post(
    "/api/posts/:id/click",
    (req, res) => {
        const posts = readJson(POSTS_FILE, []);

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

        const type = String(
            req.body.type || ""
        ).toLowerCase();

        const allowedTypes = [
            "share",
            "bookmark",
            "like",
            "dislike",
            "views",
            "view"
        ];

        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                error: "Неизвестный тип клика"
            });
        }

        if (
            !posts[index].analytics ||
            typeof posts[index].analytics !== "object"
        ) {
            posts[index].analytics = {};
        }

        if (
            !posts[index].votes ||
            typeof posts[index].votes !== "object"
        ) {
            posts[index].votes = {
                like: 0,
                dislike: 0
            };
        }

        let field = type;

        if (field === "view") {
            field = "views";
        }

        if (
            field === "like" ||
            field === "dislike"
        ) {
            posts[index].analytics[field] =
                normalizeNumber(
                    posts[index].analytics[field]
                ) + 1;

            posts[index].votes[field] =
                normalizeNumber(
                    posts[index].votes[field]
                ) + 1;
        } else {
            posts[index].analytics[field] =
                normalizeNumber(
                    posts[index].analytics[field]
                ) + 1;
        }

        posts[index].updatedAt =
            new Date().toISOString();

        writeJson(POSTS_FILE, posts);

        syncWithGitHub();

        res.json({
            success: true,
            analytics: posts[index].analytics,
            votes: posts[index].votes
        });
    }
);

/* =========================================================
   RELEASES
========================================================= */

app.get("/api/releases", (req, res) => {
    res.json(getPublicReleases());
});

app.get(
    "/api/releases/archive",
    requireAdmin,
    (req, res) => {
        res.json(getReleases());
    }
);

app.post(
    "/api/releases",
    requireAdmin,
    (req, res) => {
        const releases = getReleases();

        const now = new Date().toISOString();

        const release = {
            id:
                req.body.id ||
                generateId("release_"),

            title:
                String(
                    req.body.title ||
                    "Без названия"
                ),

            platform:
                String(
                    req.body.platform ||
                    ""
                ),

            platforms:
                Array.isArray(req.body.platforms)
                    ? req.body.platforms
                    : [],

            releaseDate:
                String(
                    req.body.releaseDate ||
                    req.body.date ||
                    ""
                ),

            date:
                String(
                    req.body.date ||
                    req.body.releaseDate ||
                    ""
                ),

            price:
                req.body.price !== undefined
                    ? normalizeNumber(
                        req.body.price
                    )
                    : 0,

            budget:
                req.body.budget !== undefined
                    ? normalizeNumber(
                        req.body.budget
                    )
                    : 0,

            imageUrl:
                String(
                    req.body.imageUrl ||
                    ""
                ),

            backgroundUrl:
                String(
                    req.body.backgroundUrl ||
                    req.body.imageUrl ||
                    ""
                ),

            description:
                String(
                    req.body.description ||
                    req.body.content ||
                    ""
                ),

            pcRequirements:
                req.body.pcRequirements || {
                    cpu: "",
                    gpu: "",
                    ram: "",
                    storage: "",
                    os: ""
                },

            archived:
                normalizeBoolean(
                    req.body.archived
                ),

            votes:
                normalizeNumber(
                    req.body.votes
                ),

            createdAt: now,
            updatedAt: now
        };

        releases.push(release);

        saveAndSync(
            RELEASES_FILE,
            releases
        );

        res.status(201).json({
            success: true,
            release
        });
    }
);

app.patch(
    "/api/releases/:id/archive",
    requireAdmin,
    (req, res) => {
        const releases = getReleases();

        const id = String(req.params.id);

        const index = releases.findIndex(
            (release) =>
                String(release.id) === id
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        const requestedArchived =
            req.body.archived !== undefined
                ? normalizeBoolean(
                    req.body.archived
                )
                : !normalizeBoolean(
                    releases[index].archived
                );

        releases[index].archived =
            requestedArchived;

        releases[index].updatedAt =
            new Date().toISOString();

        saveAndSync(
            RELEASES_FILE,
            releases
        );

        res.json({
            success: true,
            release: releases[index]
        });
    }
);

app.delete(
    "/api/releases/:id",
    requireAdmin,
    (req, res) => {
        const releases = getReleases();

        const id = String(req.params.id);

        const newReleases =
            releases.filter(
                (release) =>
                    String(release.id) !== id
            );

        if (
            newReleases.length ===
            releases.length
        ) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        saveAndSync(
            RELEASES_FILE,
            newReleases
        );

        res.json({
            success: true,
            message: "Релиз удалён"
        });
    }
);

app.post(
    "/api/releases/:id/vote",
    (req, res) => {
        const releases = getReleases();

        const id = String(req.params.id);

        const index = releases.findIndex(
            (release) =>
                String(release.id) === id
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        releases[index].votes =
            normalizeNumber(
                releases[index].votes
            ) + 1;

        writeJson(
            RELEASES_FILE,
            releases
        );

        syncWithGitHub();

        res.json({
            success: true,
            votes: releases[index].votes
        });
    }
);

/* =========================================================
   QUIZ
========================================================= */

app.get("/api/quiz", (req, res) => {
    res.json(getPublicQuiz());
});

app.post(
    "/api/quiz/manage",
    requireAdmin,
    (req, res) => {
        const current = readJson(
            QUIZ_FILE,
            {
                question: "Угадай игру",
                options: [],
                correctIndex: 0,
                imageUrl: ""
            }
        );

        const quiz = {
            question:
                req.body.question !== undefined
                    ? String(req.body.question)
                    : current.question,

            options:
                Array.isArray(req.body.options)
                    ? req.body.options
                    : normalizeArray(
                        current.options
                    ),

            correctIndex:
                req.body.correctIndex !== undefined
                    ? normalizeNumber(
                        req.body.correctIndex
                    )
                    : normalizeNumber(
                        current.correctIndex
                    ),

            imageUrl:
                req.body.imageUrl !== undefined
                    ? String(req.body.imageUrl)
                    : String(
                        current.imageUrl || ""
                    )
        };

        writeJson(QUIZ_FILE, quiz);
        syncWithGitHub();

        res.json({
            success: true,
            quiz
        });
    }
);

app.post(
    "/api/quiz/answer",
    (req, res) => {
        const quiz = readJson(
            QUIZ_FILE,
            {
                question: "",
                options: [],
                correctIndex: 0
            }
        );

        const answerIndex =
            normalizeNumber(
                req.body.answerIndex,
                -1
            );

        const correctIndex =
            normalizeNumber(
                quiz.correctIndex,
                0
            );

        res.json({
            success: true,
            correct:
                answerIndex === correctIndex
        });
    }
);

/* =========================================================
   POLL
========================================================= */

app.get("/api/poll", (req, res) => {
    res.json(getPoll());
});

app.post(
    "/api/poll/manage",
    requireAdmin,
    (req, res) => {
        const current = readJson(
            POLL_FILE,
            {
                question: "",
                options: [],
                votes: []
            }
        );

        let options;

        if (Array.isArray(req.body.options)) {
            options = req.body.options.map(
                (option, index) => {
                    if (
                        typeof option ===
                        "string"
                    ) {
                        return {
                            id: String(index),
                            text: option,
                            votes: 0
                        };
                    }

                    return {
                        id: String(
                            option.id ??
                            index
                        ),
                        text: String(
                            option.text ??
                            option.title ??
                            option.label ??
                            ""
                        ),
                        votes:
                            normalizeBoolean(
                                req.body.resetVotes
                            )
                                ? 0
                                : normalizeNumber(
                                    option.votes
                                )
                    };
                }
            );
        } else {
            options = normalizeArray(
                current.options
            );
        }

        const resetVotes =
            normalizeBoolean(
                req.body.resetVotes
            );

        if (resetVotes) {
            options = options.map(
                (option, index) => ({
                    ...option,
                    id: String(
                        option.id ?? index
                    ),
                    votes: 0
                })
            );
        }

        const poll = {
            question:
                req.body.question !== undefined
                    ? String(
                        req.body.question
                    )
                    : String(
                        current.question || ""
                    ),

            options,

            votes: resetVotes
                ? []
                : normalizeArray(
                    current.votes
                ),

            updatedAt:
                new Date().toISOString()
        };

        writeJson(POLL_FILE, poll);
        syncWithGitHub();

        res.json({
            success: true,
            poll: getPoll()
        });
    }
);

app.post(
    "/api/poll/vote",
    (req, res) => {
        const poll = readJson(
            POLL_FILE,
            {
                question: "",
                options: [],
                votes: []
            }
        );

        if (!Array.isArray(poll.options)) {
            poll.options = [];
        }

        const optionId = String(
            req.body.optionId ??
            req.body.answerIndex ??
            ""
        );

        let optionIndex =
            poll.options.findIndex(
                (option, index) => {
                    if (
                        typeof option ===
                        "string"
                    ) {
                        return (
                            String(index) ===
                            optionId
                        );
                    }

                    return (
                        String(
                            option.id ??
                            index
                        ) === optionId
                    );
                }
            );

        if (optionIndex === -1) {
            const numericIndex =
                Number(optionId);

            if (
                Number.isInteger(
                    numericIndex
                ) &&
                numericIndex >= 0 &&
                numericIndex <
                poll.options.length
            ) {
                optionIndex =
                    numericIndex;
            }
        }

        if (optionIndex === -1) {
            return res.status(400).json({
                success: false,
                error: "Вариант ответа не найден"
            });
        }

        const option =
            poll.options[optionIndex];

        if (
            typeof option === "string"
        ) {
            poll.options[optionIndex] = {
                id: String(optionIndex),
                text: option,
                votes: 1
            };
        } else {
            poll.options[optionIndex] = {
                ...option,
                votes:
                    normalizeNumber(
                        option.votes
                    ) + 1
            };
        }

        if (!Array.isArray(poll.votes)) {
            poll.votes = [];
        }

        poll.votes.push({
            optionId:
                String(
                    poll.options[
                        optionIndex
                    ].id ??
                    optionIndex
                ),
            createdAt:
                new Date().toISOString()
        });

        writeJson(POLL_FILE, poll);
        syncWithGitHub();

        res.json({
            success: true,
            poll: getPoll()
        });
    }
);

/* =========================================================
   CLEAR WHOLE DATABASE
========================================================= */

app.post(
    "/api/admin/clear-all",
    requireAdmin,
    (req, res) => {
        const emptyPosts = [];
        const emptyReleases = [];

        const currentConfig = getConfig();

        const cleanConfig = {
            password: currentConfig.password,
            siteName:
                currentConfig.siteName ||
                "PlayPC",
            musicPlaylist: [],
            footerText:
                typeof currentConfig.footerText ===
                "string"
                    ? currentConfig.footerText
                    : DEFAULT_FOOTER_TEXT
        };

        const cleanQuiz = {
            question: "Угадай игру",
            options: [],
            correctIndex: 0,
            imageUrl: ""
        };

        const cleanPoll = {
            question: "",
            options: [],
            votes: []
        };

        writeJson(
            POSTS_FILE,
            emptyPosts
        );

        writeJson(
            RELEASES_FILE,
            emptyReleases
        );

        writeJson(
            CONFIG_FILE,
            cleanConfig
        );

        writeJson(
            QUIZ_FILE,
            cleanQuiz
        );

        writeJson(
            POLL_FILE,
            cleanPoll
        );

        syncWithGitHub();

        res.json({
            success: true,
            message:
                "База PlayPC полностью очищена"
        });
    }
);

/* =========================================================
   404 API
========================================================= */

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        error: "API route not found"
    });
});

/* =========================================================
   SERVER
========================================================= */

app.listen(PORT, () => {
    console.log(
        `PlayPC server запущен на порту ${PORT}`
    );
});