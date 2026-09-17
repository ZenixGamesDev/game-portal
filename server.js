const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ADMIN SECURITY
// ============================================================

const ADMIN_PASSWORD = "AdminPlayPC2026";

// ============================================================
// PATHS
// ============================================================

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const POSTS_FILE = path.join(ROOT_DIR, "posts.json");
const RELEASES_FILE = path.join(ROOT_DIR, "releases.json");
const CONFIG_FILE = path.join(ROOT_DIR, "config.json");
const QUIZ_FILE = path.join(ROOT_DIR, "quiz.json");
const POLL_FILE = path.join(ROOT_DIR, "poll.json");

// ============================================================
// DEFAULT DATA
// ============================================================

const DEFAULT_SITE_NAME = "PlayPC";

const DEFAULT_FOOTER_TEXT =
    "Юридическая информация • Сентябрь 2026\n" +
    "PlayPC в рамках функций данного интерфейса не использует cookies и не собирает персональные данные пользователей. " +
    "Данные не передаются третьим лицам через пользовательский интерфейс сайта. " +
    "Эксплуатация проекта должна осуществляться с учётом применимого законодательства Российской Федерации и Азербайджанской Республики.";

const DEFAULT_CONFIG = {
    siteName: DEFAULT_SITE_NAME,
    footerText: DEFAULT_FOOTER_TEXT,
    musicPlaylist: []
};

const DEFAULT_QUIZ = {
    question: "Угадай игру",
    options: [],
    correctIndex: 0,
    imageUrl: ""
};

const DEFAULT_POLL = {
    question: "",
    options: [],
    votes: []
};

// ============================================================
// EXPRESS
// ============================================================

app.use(
    express.json({
        limit: "50mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "50mb"
    })
);

app.use(
    express.static(PUBLIC_DIR)
);

// ============================================================
// FILE HELPERS
// ============================================================

function ensureJsonFile(filePath, defaultData) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(
            filePath,
            JSON.stringify(defaultData, null, 2),
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

        const content = fs.readFileSync(
            filePath,
            "utf8"
        );

        if (!content.trim()) {
            fs.writeFileSync(
                filePath,
                JSON.stringify(fallback, null, 2),
                "utf8"
            );

            return fallback;
        }

        return JSON.parse(content);
    } catch (error) {
        console.error(
            `Ошибка чтения ${path.basename(filePath)}:`,
            error.message
        );

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

function initializeFiles() {
    ensureJsonFile(
        POSTS_FILE,
        []
    );

    ensureJsonFile(
        RELEASES_FILE,
        []
    );

    ensureJsonFile(
        CONFIG_FILE,
        DEFAULT_CONFIG
    );

    ensureJsonFile(
        QUIZ_FILE,
        DEFAULT_QUIZ
    );

    ensureJsonFile(
        POLL_FILE,
        DEFAULT_POLL
    );

    // Добавляем отсутствующие поля в существующий config.json,
    // не перезаписывая уже существующие данные.
    const config = readJson(
        CONFIG_FILE,
        DEFAULT_CONFIG
    );

    let changed = false;

    if (
        typeof config.siteName !== "string" ||
        !config.siteName.trim()
    ) {
        config.siteName = DEFAULT_SITE_NAME;
        changed = true;
    }

    if (
        typeof config.footerText !== "string"
    ) {
        config.footerText = DEFAULT_FOOTER_TEXT;
        changed = true;
    }

    if (
        !Array.isArray(config.musicPlaylist)
    ) {
        config.musicPlaylist = [];
        changed = true;
    }

    if (changed) {
        writeJson(
            CONFIG_FILE,
            config
        );
    }
}

initializeFiles();

// ============================================================
// GITHUB AUTO SYNC
// ============================================================

function syncWithGitHub() {
    return new Promise((resolve) => {
        const gitFiles = [
            "posts.json",
            "releases.json",
            "config.json",
            "quiz.json",
            "poll.json"
        ];

        const addCommand =
            `git add ${gitFiles.join(" ")}`;

        exec(
            addCommand,
            {
                cwd: ROOT_DIR
            },
            (addError) => {
                if (addError) {
                    console.error(
                        "Git add error:",
                        addError.message
                    );

                    resolve(false);
                    return;
                }

                exec(
                    'git diff --cached --quiet',
                    {
                        cwd: ROOT_DIR
                    },
                    (diffError) => {
                        // Код 0 = изменений нет.
                        if (
                            !diffError ||
                            diffError.code === 0
                        ) {
                            console.log(
                                "GitHub sync: изменений для коммита нет."
                            );

                            resolve(true);
                            return;
                        }

                        exec(
                            'git commit -m "PlayPC automatic data update"',
                            {
                                cwd: ROOT_DIR
                            },
                            (commitError) => {
                                if (commitError) {
                                    console.error(
                                        "Git commit error:",
                                        commitError.message
                                    );

                                    resolve(false);
                                    return;
                                }

                                // На локальном запуске push не выполняем.
                                // На Render process.env.PORT существует.
                                if (!process.env.PORT) {
                                    console.log(
                                        "Local mode: git push skipped."
                                    );

                                    resolve(true);
                                    return;
                                }

                                exec(
                                    "git push origin main",
                                    {
                                        cwd: ROOT_DIR
                                    },
                                    (pushError) => {
                                        if (pushError) {
                                            console.error(
                                                "Git push error:",
                                                pushError.message
                                            );

                                            resolve(false);
                                            return;
                                        }

                                        console.log(
                                            "GitHub sync: push успешно выполнен."
                                        );

                                        resolve(true);
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
}

// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

function requireAdmin(req, res, next) {
    const password =
        req.body &&
        typeof req.body.password === "string"
            ? req.body.password
            : "";

    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({
            success: false,
            error: "Неверный пароль администратора"
        });
    }

    next();
}

// ============================================================
// BASIC HELPERS
// ============================================================

function generateId(prefix) {
    return (
        prefix +
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

function toNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function toBoolean(value) {
    return (
        value === true ||
        value === "true" ||
        value === 1 ||
        value === "1"
    );
}

function normalizePost(post) {
    const normalized = {
        ...post
    };

    if (
        !normalized.analytics ||
        typeof normalized.analytics !== "object"
    ) {
        normalized.analytics = {};
    }

    normalized.analytics = {
        views: toNumber(
            normalized.analytics.views
        ),
        share: toNumber(
            normalized.analytics.share
        ),
        bookmark: toNumber(
            normalized.analytics.bookmark
        ),
        like: toNumber(
            normalized.analytics.like
        ),
        dislike: toNumber(
            normalized.analytics.dislike
        )
    };

    if (
        !normalized.votes ||
        typeof normalized.votes !== "object"
    ) {
        normalized.votes = {};
    }

    normalized.votes = {
        like: toNumber(
            normalized.votes.like
        ),
        dislike: toNumber(
            normalized.votes.dislike
        )
    };

    return normalized;
}

function getConfig() {
    const config = readJson(
        CONFIG_FILE,
        DEFAULT_CONFIG
    );

    if (
        typeof config.siteName !== "string" ||
        !config.siteName.trim()
    ) {
        config.siteName = DEFAULT_SITE_NAME;
    }

    if (
        typeof config.footerText !== "string"
    ) {
        config.footerText = DEFAULT_FOOTER_TEXT;
    }

    if (
        !Array.isArray(config.musicPlaylist)
    ) {
        config.musicPlaylist = [];
    }

    return config;
}

function getPosts() {
    const posts = readJson(
        POSTS_FILE,
        []
    );

    return Array.isArray(posts)
        ? posts
        : [];
}

function getReleases() {
    const releases = readJson(
        RELEASES_FILE,
        []
    );

    return Array.isArray(releases)
        ? releases
        : [];
}

function getQuiz() {
    return readJson(
        QUIZ_FILE,
        DEFAULT_QUIZ
    );
}

function getPoll() {
    return readJson(
        POLL_FILE,
        DEFAULT_POLL
    );
}

// ============================================================
// MAIN PAGE
// ============================================================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(
            PUBLIC_DIR,
            "index.html"
        )
    );
});

// ============================================================
// CONFIG - PUBLIC
// ============================================================

app.get("/api/config", (req, res) => {
    const config = getConfig();

    res.json({
        siteName: config.siteName,
        footerText: config.footerText,
        musicPlaylist: config.musicPlaylist
    });
});

// ============================================================
// CONFIG - ADMIN
// ============================================================

app.post(
    "/api/admin/config",
    requireAdmin,
    async (req, res) => {
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

        writeJson(
            CONFIG_FILE,
            config
        );

        await syncWithGitHub();

        res.json({
            success: true,
            message: "Настройки сохранены",
            config: {
                siteName: config.siteName,
                footerText: config.footerText,
                musicPlaylist:
                    config.musicPlaylist
            }
        });
    }
);

// Совместимость с предыдущей версией фронтенда.
app.post(
    "/api/config/manage",
    requireAdmin,
    async (req, res) => {
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
            Array.isArray(
                req.body.musicPlaylist
            )
        ) {
            config.musicPlaylist =
                req.body.musicPlaylist;
        }

        writeJson(
            CONFIG_FILE,
            config
        );

        await syncWithGitHub();

        res.json({
            success: true,
            config: {
                siteName: config.siteName,
                footerText: config.footerText,
                musicPlaylist:
                    config.musicPlaylist
            }
        });
    }
);

// ============================================================
// MUSIC
// ============================================================

app.get("/api/music", (req, res) => {
    const config = getConfig();

    res.json({
        musicPlaylist:
            config.musicPlaylist
    });
});

app.post(
    "/api/music/manage",
    requireAdmin,
    async (req, res) => {
        if (
            !Array.isArray(
                req.body.musicPlaylist
            )
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "musicPlaylist должен быть массивом"
            });
        }

        const config = getConfig();

        config.musicPlaylist =
            req.body.musicPlaylist;

        writeJson(
            CONFIG_FILE,
            config
        );

        await syncWithGitHub();

        res.json({
            success: true,
            musicPlaylist:
                config.musicPlaylist
        });
    }
);

app.delete(
    "/api/admin/music/:id",
    requireAdmin,
    async (req, res) => {
        const config = getConfig();

        const id = String(
            req.params.id
        );

        const playlist =
            Array.isArray(
                config.musicPlaylist
            )
                ? config.musicPlaylist
                : [];

        const filteredPlaylist =
            playlist.filter((track) => {
                if (
                    !track ||
                    typeof track !== "object"
                ) {
                    return true;
                }

                return String(track.id) !== id;
            });

        if (
            filteredPlaylist.length ===
            playlist.length
        ) {
            return res.status(404).json({
                success: false,
                error: "Трек не найден"
            });
        }

        config.musicPlaylist =
            filteredPlaylist;

        writeJson(
            CONFIG_FILE,
            config
        );

        await syncWithGitHub();

        res.json({
            success: true,
            message: "Трек удалён",
            musicPlaylist:
                filteredPlaylist
        });
    }
);

// ============================================================
// POSTS - PUBLIC
// ============================================================

app.get("/api/posts", (req, res) => {
    const posts = getPosts();

    const now = Date.now();

    const visiblePosts = posts.filter(
        (post) => {
            if (
                toBoolean(post.isDraft)
            ) {
                return false;
            }

            if (!post.publishAt) {
                return true;
            }

            const publishTime =
                new Date(
                    post.publishAt
                ).getTime();

            if (
                !Number.isFinite(
                    publishTime
                )
            ) {
                return true;
            }

            return publishTime <= now;
        }
    );

    visiblePosts.sort(
        (a, b) => {
            const dateA =
                new Date(
                    a.publishAt ||
                    a.createdAt ||
                    0
                ).getTime();

            const dateB =
                new Date(
                    b.publishAt ||
                    b.createdAt ||
                    0
                ).getTime();

            return dateB - dateA;
        }
    );

    res.json(
        visiblePosts.map(
            normalizePost
        )
    );
});

// ============================================================
// POSTS - ADMIN CREATE
// ============================================================

app.post(
    "/api/posts",
    requireAdmin,
    async (req, res) => {
        const posts = getPosts();

        const now =
            new Date().toISOString();

        const post = {
            id:
                req.body.id ||
                generateId("post_"),

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

            imageUrl:
                String(
                    req.body.imageUrl ||
                    ""
                ),

            content:
                String(
                    req.body.content ||
                    ""
                ),

            moodTag:
                String(
                    req.body.moodTag ||
                    ""
                ),

            isDraft:
                toBoolean(
                    req.body.isDraft
                ),

            publishAt:
                req.body.publishAt
                    ? String(
                        req.body.publishAt
                    )
                    : "",

            pinned:
                toBoolean(
                    req.body.pinned
                ),

            createdAt: now,
            updatedAt: now,

            analytics: {
                views: 0,
                share: 0,
                bookmark: 0,
                like: 0,
                dislike: 0
            },

            votes: {
                like: 0,
                dislike: 0
            }
        };

        posts.push(post);

        writeJson(
            POSTS_FILE,
            posts
        );

        await syncWithGitHub();

        res.status(201).json({
            success: true,
            post: normalizePost(post)
        });
    }
);

// ============================================================
// POSTS - ADMIN UPDATE
// ============================================================

app.put(
    "/api/posts/:id",
    requireAdmin,
    async (req, res) => {
        const posts = getPosts();

        const id = String(
            req.params.id
        );

        const index =
            posts.findIndex(
                (post) =>
                    String(post.id) === id
            );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Новость не найдена"
            });
        }

        const oldPost =
            posts[index];

        const oldAnalytics =
            oldPost.analytics &&
            typeof oldPost.analytics ===
                "object"
                ? oldPost.analytics
                : {};

        const oldVotes =
            oldPost.votes &&
            typeof oldPost.votes ===
                "object"
                ? oldPost.votes
                : {};

        const updatedPost = {
            ...oldPost,

            title:
                req.body.title !== undefined
                    ? String(
                        req.body.title
                    )
                    : String(
                        oldPost.title || ""
                    ),

            platform:
                req.body.platform !== undefined
                    ? String(
                        req.body.platform
                    )
                    : String(
                        oldPost.platform || ""
                    ),

            imageUrl:
                req.body.imageUrl !== undefined
                    ? String(
                        req.body.imageUrl
                    )
                    : String(
                        oldPost.imageUrl || ""
                    ),

            content:
                req.body.content !== undefined
                    ? String(
                        req.body.content
                    )
                    : String(
                        oldPost.content || ""
                    ),

            moodTag:
                req.body.moodTag !== undefined
                    ? String(
                        req.body.moodTag
                    )
                    : String(
                        oldPost.moodTag || ""
                    ),

            isDraft:
                req.body.isDraft !== undefined
                    ? toBoolean(
                        req.body.isDraft
                    )
                    : toBoolean(
                        oldPost.isDraft
                    ),

            publishAt:
                req.body.publishAt !== undefined
                    ? String(
                        req.body.publishAt
                    )
                    : String(
                        oldPost.publishAt || ""
                    ),

            pinned:
                req.body.pinned !== undefined
                    ? toBoolean(
                        req.body.pinned
                    )
                    : toBoolean(
                        oldPost.pinned
                    ),

            updatedAt:
                new Date().toISOString(),

            analytics: {
                views:
                    toNumber(
                        oldAnalytics.views
                    ),

                share:
                    toNumber(
                        oldAnalytics.share
                    ),

                bookmark:
                    toNumber(
                        oldAnalytics.bookmark
                    ),

                like:
                    toNumber(
                        oldAnalytics.like
                    ),

                dislike:
                    toNumber(
                        oldAnalytics.dislike
                    )
            },

            votes: {
                like:
                    toNumber(
                        oldVotes.like
                    ),

                dislike:
                    toNumber(
                        oldVotes.dislike
                    )
            }
        };

        posts[index] =
            updatedPost;

        writeJson(
            POSTS_FILE,
            posts
        );

        await syncWithGitHub();

        res.json({
            success: true,
            post:
                normalizePost(
                    updatedPost
                )
        });
    }
);

// ============================================================
// POSTS - ADMIN DELETE
// ============================================================

app.delete(
    "/api/posts/:id",
    requireAdmin,
    async (req, res) => {
        const posts = getPosts();

        const id = String(
            req.params.id
        );

        const filtered =
            posts.filter(
                (post) =>
                    String(post.id) !== id
            );

        if (
            filtered.length ===
            posts.length
        ) {
            return res.status(404).json({
                success: false,
                error: "Новость не найдена"
            });
        }

        writeJson(
            POSTS_FILE,
            filtered
        );

        await syncWithGitHub();

        res.json({
            success: true,
            message: "Новость удалена"
        });
    }
);

// ============================================================
// POSTS - CLICKS / ANALYTICS
// ============================================================

app.post(
    "/api/posts/:id/click",
    async (req, res) => {
        const posts = getPosts();

        const id = String(
            req.params.id
        );

        const index =
            posts.findIndex(
                (post) =>
                    String(post.id) === id
            );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Новость не найдена"
            });
        }

        const type =
            String(
                req.body.type || ""
            ).toLowerCase();

        const allowedTypes = [
            "views",
            "view",
            "share",
            "bookmark",
            "like",
            "dislike"
        ];

        if (
            !allowedTypes.includes(
                type
            )
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Недопустимый тип аналитики"
            });
        }

        if (
            !posts[index].analytics ||
            typeof posts[index].analytics !==
                "object"
        ) {
            posts[index].analytics = {};
        }

        if (
            !posts[index].votes ||
            typeof posts[index].votes !==
                "object"
        ) {
            posts[index].votes = {};
        }

        let field = type;

        if (field === "view") {
            field = "views";
        }

        posts[index].analytics[field] =
            toNumber(
                posts[index].analytics[field]
            ) + 1;

        if (
            field === "like" ||
            field === "dislike"
        ) {
            posts[index].votes[field] =
                toNumber(
                    posts[index].votes[field]
                ) + 1;
        }

        posts[index].updatedAt =
            new Date().toISOString();

        writeJson(
            POSTS_FILE,
            posts
        );

        await syncWithGitHub();

        res.json({
            success: true,
            analytics:
                posts[index].analytics,
            votes:
                posts[index].votes
        });
    }
);

// ============================================================
// RELEASES - PUBLIC CATALOG
// ============================================================

app.get(
    "/api/releases",
    (req, res) => {
        const releases =
            getReleases();

        const active =
            releases
                .filter(
                    (release) =>
                        !toBoolean(
                            release.archived
                        )
                )
                .sort(
                    (a, b) => {
                        const dateA =
                            new Date(
                                a.releaseDate ||
                                a.date ||
                                0
                            ).getTime();

                        const dateB =
                            new Date(
                                b.releaseDate ||
                                b.date ||
                                0
                            ).getTime();

                        return (
                            dateA - dateB
                        );
                    }
                );

        res.json(active);
    }
);

// ============================================================
// RELEASES - ADMIN ARCHIVE
// ============================================================

app.get(
    "/api/releases/archive",
    requireAdmin,
    (req, res) => {
        res.json(
            getReleases()
        );
    }
);

// ============================================================
// RELEASES - ADMIN CREATE
// ============================================================

app.post(
    "/api/releases",
    requireAdmin,
    async (req, res) => {
        const releases =
            getReleases();

        const now =
            new Date().toISOString();

        const platforms =
            Array.isArray(
                req.body.platforms
            )
                ? req.body.platforms
                : (
                    req.body.platform
                        ? [
                            String(
                                req.body.platform
                            )
                        ]
                        : []
                );

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
                    platforms.join(", ")
                ),

            platforms,

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
                toNumber(
                    req.body.price
                ),

            budget:
                toNumber(
                    req.body.budget
                ),

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
                req.body.pcRequirements &&
                typeof req.body.pcRequirements ===
                    "object"
                    ? req.body.pcRequirements
                    : {
                        cpu: "",
                        gpu: "",
                        ram: "",
                        storage: "",
                        os: ""
                    },

            archived:
                toBoolean(
                    req.body.archived
                ),

            votes:
                toNumber(
                    req.body.votes
                ),

            createdAt: now,
            updatedAt: now
        };

        releases.push(
            release
        );

        writeJson(
            RELEASES_FILE,
            releases
        );

        await syncWithGitHub();

        res.status(201).json({
            success: true,
            release
        });
    }
);

// ============================================================
// RELEASES - ADMIN ARCHIVE TOGGLE
// ============================================================

app.patch(
    "/api/releases/:id/archive",
    requireAdmin,
    async (req, res) => {
        const releases =
            getReleases();

        const id = String(
            req.params.id
        );

        const index =
            releases.findIndex(
                (release) =>
                    String(
                        release.id
                    ) === id
            );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        if (
            req.body.archived !==
            undefined
        ) {
            releases[index].archived =
                toBoolean(
                    req.body.archived
                );
        } else {
            releases[index].archived =
                !toBoolean(
                    releases[index].archived
                );
        }

        releases[index].updatedAt =
            new Date().toISOString();

        writeJson(
            RELEASES_FILE,
            releases
        );

        await syncWithGitHub();

        res.json({
            success: true,
            release:
                releases[index]
        });
    }
);

// ============================================================
// RELEASES - ADMIN DELETE
// ============================================================

app.delete(
    "/api/releases/:id",
    requireAdmin,
    async (req, res) => {
        const releases =
            getReleases();

        const id = String(
            req.params.id
        );

        const filtered =
            releases.filter(
                (release) =>
                    String(
                        release.id
                    ) !== id
            );

        if (
            filtered.length ===
            releases.length
        ) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        writeJson(
            RELEASES_FILE,
            filtered
        );

        await syncWithGitHub();

        res.json({
            success: true,
            message: "Релиз удалён"
        });
    }
);

// ============================================================
// RELEASES - PUBLIC VOTE
// ============================================================

app.post(
    "/api/releases/:id/vote",
    async (req, res) => {
        const releases =
            getReleases();

        const id = String(
            req.params.id
        );

        const index =
            releases.findIndex(
                (release) =>
                    String(
                        release.id
                    ) === id
            );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Релиз не найден"
            });
        }

        releases[index].votes =
            toNumber(
                releases[index].votes
            ) + 1;

        writeJson(
            RELEASES_FILE,
            releases
        );

        await syncWithGitHub();

        res.json({
            success: true,
            votes:
                releases[index].votes
        });
    }
);

// ============================================================
// QUIZ - PUBLIC
// ============================================================

app.get(
    "/api/quiz",
    (req, res) => {
        const quiz =
            getQuiz();

        res.json({
            question:
                String(
                    quiz.question ||
                    "Угадай игру"
                ),

            options:
                Array.isArray(
                    quiz.options
                )
                    ? quiz.options
                    : [],

            imageUrl:
                String(
                    quiz.imageUrl ||
                    ""
                )
        });
    }
);

// ============================================================
// QUIZ - ADMIN
// ============================================================

app.post(
    "/api/quiz/manage",
    requireAdmin,
    async (req, res) => {
        const oldQuiz =
            getQuiz();

        const quiz = {
            question:
                req.body.question !==
                undefined
                    ? String(
                        req.body.question
                    )
                    : String(
                        oldQuiz.question ||
                        "Угадай игру"
                    ),

            options:
                Array.isArray(
                    req.body.options
                )
                    ? req.body.options
                    : (
                        Array.isArray(
                            oldQuiz.options
                        )
                            ? oldQuiz.options
                            : []
                    ),

            correctIndex:
                req.body.correctIndex !==
                undefined
                    ? toNumber(
                        req.body.correctIndex
                    )
                    : toNumber(
                        oldQuiz.correctIndex
                    ),

            imageUrl:
                req.body.imageUrl !==
                undefined
                    ? String(
                        req.body.imageUrl
                    )
                    : String(
                        oldQuiz.imageUrl ||
                        ""
                    )
        };

        writeJson(
            QUIZ_FILE,
            quiz
        );

        await syncWithGitHub();

        res.json({
            success: true,
            quiz
        });
    }
);

// ============================================================
// QUIZ - PUBLIC ANSWER
// ============================================================

app.post(
    "/api/quiz/answer",
    (req, res) => {
        const quiz =
            getQuiz();

        const answerIndex =
            toNumber(
                req.body.answerIndex,
                -1
            );

        const correctIndex =
            toNumber(
                quiz.correctIndex,
                0
            );

        res.json({
            success: true,
            correct:
                answerIndex ===
                correctIndex
        });
    }
);

// ============================================================
// POLL - PUBLIC
// ============================================================

app.get(
    "/api/poll",
    (req, res) => {
        const poll =
            getPoll();

        const options =
            Array.isArray(
                poll.options
            )
                ? poll.options
                : [];

        const normalizedOptions =
            options.map(
                (option, index) => {
                    if (
                        typeof option ===
                        "string"
                    ) {
                        return {
                            id:
                                String(
                                    index
                                ),
                            text:
                                option,
                            votes: 0
                        };
                    }

                    return {
                        id:
                            String(
                                option.id ??
                                index
                            ),

                        text:
                            String(
                                option.text ??
                                option.title ??
                                option.label ??
                                ""
                            ),

                        votes:
                            toNumber(
                                option.votes
                            )
                    };
                }
            );

        const totalVotes =
            normalizedOptions.reduce(
                (sum, option) =>
                    sum +
                    toNumber(
                        option.votes
                    ),
                0
            );

        res.json({
            question:
                String(
                    poll.question ||
                    "Опрос готовится к запуску"
                ),

            options:
                normalizedOptions.map(
                    (option) => ({
                        ...option,

                        percentage:
                            totalVotes > 0
                                ? Math.round(
                                    (
                                        toNumber(
                                            option.votes
                                        ) /
                                        totalVotes
                                    ) * 100
                                )
                                : 0
                    })
                ),

            totalVotes
        });
    }
);

// ============================================================
// POLL - ADMIN
// ============================================================

app.post(
    "/api/poll/manage",
    requireAdmin,
    async (req, res) => {
        const oldPoll =
            getPoll();

        const resetVotes =
            toBoolean(
                req.body.resetVotes
            );

        let options;

        if (
            Array.isArray(
                req.body.options
            )
        ) {
            options =
                req.body.options.map(
                    (option, index) => {
                        if (
                            typeof option ===
                            "string"
                        ) {
                            return {
                                id:
                                    String(
                                        index
                                    ),
                                text:
                                    option,
                                votes: 0
                            };
                        }

                        return {
                            id:
                                String(
                                    option.id ??
                                    index
                                ),

                            text:
                                String(
                                    option.text ??
                                    option.title ??
                                    option.label ??
                                    ""
                                ),

                            votes:
                                resetVotes
                                    ? 0
                                    : toNumber(
                                        option.votes
                                    )
                        };
                    }
                );
        } else {
            options =
                Array.isArray(
                    oldPoll.options
                )
                    ? oldPoll.options
                    : [];
        }

        if (resetVotes) {
            options =
                options.map(
                    (option, index) => ({
                        ...option,
                        id:
                            String(
                                option.id ??
                                index
                            ),
                        votes: 0
                    })
                );
        }

        const poll = {
            question:
                req.body.question !==
                undefined
                    ? String(
                        req.body.question
                    )
                    : String(
                        oldPoll.question ||
                        ""
                    ),

            options,

            votes:
                resetVotes
                    ? []
                    : (
                        Array.isArray(
                            oldPoll.votes
                        )
                            ? oldPoll.votes
                            : []
                    ),

            updatedAt:
                new Date().toISOString()
        };

        writeJson(
            POLL_FILE,
            poll
        );

        await syncWithGitHub();

        res.json({
            success: true,
            poll
        });
    }
);

// ============================================================
// POLL - PUBLIC VOTE
// ============================================================

app.post(
    "/api/poll/vote",
    async (req, res) => {
        const poll =
            getPoll();

        if (
            !Array.isArray(
                poll.options
            )
        ) {
            poll.options = [];
        }

        const requestedId =
            String(
                req.body.optionId ??
                req.body.answerIndex ??
                ""
            );

        let index =
            poll.options.findIndex(
                (option, optionIndex) => {
                    if (
                        typeof option ===
                        "string"
                    ) {
                        return (
                            String(
                                optionIndex
                            ) ===
                            requestedId
                        );
                    }

                    return (
                        String(
                            option.id ??
                            optionIndex
                        ) ===
                        requestedId
                    );
                }
            );

        if (index === -1) {
            const numericIndex =
                Number(
                    requestedId
                );

            if (
                Number.isInteger(
                    numericIndex
                ) &&
                numericIndex >= 0 &&
                numericIndex <
                    poll.options.length
            ) {
                index =
                    numericIndex;
            }
        }

        if (index === -1) {
            return res.status(400).json({
                success: false,
                error:
                    "Вариант ответа не найден"
            });
        }

        const current =
            poll.options[index];

        if (
            typeof current ===
            "string"
        ) {
            poll.options[index] = {
                id:
                    String(index),
                text:
                    current,
                votes: 1
            };
        } else {
            poll.options[index] = {
                ...current,
                votes:
                    toNumber(
                        current.votes
                    ) + 1
            };
        }

        if (
            !Array.isArray(
                poll.votes
            )
        ) {
            poll.votes = [];
        }

        poll.votes.push({
            optionId:
                String(
                    poll.options[index].id ??
                    index
                ),
            createdAt:
                new Date().toISOString()
        });

        writeJson(
            POLL_FILE,
            poll
        );

        await syncWithGitHub();

        res.json({
            success: true,
            poll
        });
    }
);

// ============================================================
// ADMIN - CLEAR ALL DATA
// ============================================================

app.post(
    "/api/admin/clear-all",
    requireAdmin,
    async (req, res) => {
        const config =
            getConfig();

        const cleanConfig = {
            siteName:
                config.siteName ||
                DEFAULT_SITE_NAME,

            footerText:
                typeof config.footerText ===
                "string"
                    ? config.footerText
                    : DEFAULT_FOOTER_TEXT,

            musicPlaylist: []
        };

        writeJson(
            POSTS_FILE,
            []
        );

        writeJson(
            RELEASES_FILE,
            []
        );

        writeJson(
            CONFIG_FILE,
            cleanConfig
        );

        writeJson(
            QUIZ_FILE,
            DEFAULT_QUIZ
        );

        writeJson(
            POLL_FILE,
            DEFAULT_POLL
        );

        await syncWithGitHub();

        res.json({
            success: true,
            message:
                "Все данные PlayPC очищены"
        });
    }
);

// ============================================================
// 404 API
// ============================================================

app.use(
    "/api",
    (req, res) => {
        res.status(404).json({
            success: false,
            error:
                "API endpoint не найден"
        });
    }
);

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (error, req, res, next) => {
        console.error(
            "Server error:",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({
            success: false,
            error:
                "Внутренняя ошибка сервера"
        });
    }
);

// ============================================================
// START
// ============================================================

app.listen(
    PORT,
    () => {
        console.log(
            `PlayPC server запущен на порту ${PORT}`
        );
    }
);