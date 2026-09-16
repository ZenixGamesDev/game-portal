const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = "AdminPlayPC2026";

const PUBLIC_DIR = path.join(__dirname, "public");
const POSTS_FILE = path.join(__dirname, "posts.json");
const RELEASES_FILE = path.join(__dirname, "releases.json");

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(PUBLIC_DIR));

function ensureJsonFile(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(
                filePath,
                JSON.stringify(defaultValue, null, 2),
                "utf8"
            );
            return;
        }

        const content = fs.readFileSync(filePath, "utf8").trim();

        if (!content) {
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

function readJsonFile(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }

        const content = fs.readFileSync(filePath, "utf8").trim();

        if (!content) {
            return fallback;
        }

        const parsed = JSON.parse(content);

        return parsed;
    } catch (error) {
        console.error(`Ошибка чтения ${filePath}:`, error);
        return fallback;
    }
}

function writeJsonFile(filePath, data) {
    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

function isAdminAuthorized(req) {
    const bodyPassword =
        typeof req.body?.password === "string"
            ? req.body.password
            : "";

    const headerPassword =
        typeof req.headers["x-admin-password"] === "string"
            ? req.headers["x-admin-password"]
            : "";

    return (
        bodyPassword === ADMIN_PASSWORD ||
        headerPassword === ADMIN_PASSWORD
    );
}

function requireAdmin(req, res, next) {
    if (!isAdminAuthorized(req)) {
        return res.status(401).json({
            error: "Неверный пароль администратора."
        });
    }

    next();
}

function normalizePlatforms(platforms) {
    if (Array.isArray(platforms)) {
        return platforms
            .map(platform => String(platform).trim())
            .filter(Boolean);
    }

    if (typeof platforms === "string") {
        return platforms
            .split(",")
            .map(platform => platform.trim())
            .filter(Boolean);
    }

    return [];
}

function normalizeNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === "") {
        return defaultValue;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : defaultValue;
}

function normalizeBoolean(value, defaultValue = false) {
    if (value === undefined || value === null) {
        return defaultValue;
    }

    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (
            normalized === "true" ||
            normalized === "1" ||
            normalized === "yes" ||
            normalized === "on"
        ) {
            return true;
        }

        if (
            normalized === "false" ||
            normalized === "0" ||
            normalized === "no" ||
            normalized === "off"
        ) {
            return false;
        }
    }

    return Boolean(value);
}

function validateReleaseDate(releaseDate) {
    if (typeof releaseDate !== "string") {
        return false;
    }

    const value = releaseDate.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function sanitizeReleaseInput(body) {
    const title =
        typeof body.title === "string"
            ? body.title.trim()
            : "";

    const releaseDate =
        typeof body.releaseDate === "string"
            ? body.releaseDate.trim()
            : "";

    const priceDigital =
        typeof body.priceDigital === "string" ||
        typeof body.priceDigital === "number"
            ? String(body.priceDigital).trim()
            : "";

    const priceDisk =
        typeof body.priceDisk === "string" ||
        typeof body.priceDisk === "number"
            ? String(body.priceDisk).trim()
            : "";

    const systemReq =
        typeof body.systemReq === "string"
            ? body.systemReq.trim()
            : "";

    const bgUrl =
        typeof body.bgUrl === "string"
            ? body.bgUrl.trim()
            : "";

    return {
        title,
        releaseDate,
        priceDigital,
        priceDisk,
        platforms: normalizePlatforms(body.platforms),
        systemReq,
        bgUrl,
        discount: Math.max(
            0,
            Math.min(
                100,
                normalizeNumber(body.discount, 0)
            )
        ),
        isMainHit: normalizeBoolean(body.isMainHit, false),
        isArchived: normalizeBoolean(body.isArchived, false)
    };
}

ensureJsonFile(POSTS_FILE, []);
ensureJsonFile(RELEASES_FILE, []);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "PlayPC",
        timestamp: new Date().toISOString()
    });
});

/*
|--------------------------------------------------------------------------
| POSTS
|--------------------------------------------------------------------------
*/

app.get("/api/posts", (req, res) => {
    try {
        const posts = readJsonFile(POSTS_FILE, []);

        if (!Array.isArray(posts)) {
            return res.status(500).json({
                error: "Некорректный формат posts.json."
            });
        }

        posts.sort((a, b) => {
            if (Boolean(a.pinned) !== Boolean(b.pinned)) {
                return Boolean(b.pinned) - Boolean(a.pinned);
            }

            const dateA = new Date(
                a.createdAt || a.date || 0
            ).getTime();

            const dateB = new Date(
                b.createdAt || b.date || 0
            ).getTime();

            return dateB - dateA;
        });

        res.json(posts);
    } catch (error) {
        console.error("GET /api/posts:", error);

        res.status(500).json({
            error: "Не удалось загрузить новости."
        });
    }
});

app.post("/api/posts", requireAdmin, (req, res) => {
    try {
        const {
            title,
            platform,
            imageUrl,
            content,
            pinned
        } = req.body;

        if (
            typeof title !== "string" ||
            !title.trim()
        ) {
            return res.status(400).json({
                error: "Заголовок новости обязателен."
            });
        }

        if (
            typeof content !== "string" ||
            !content.trim()
        ) {
            return res.status(400).json({
                error: "Текст новости обязателен."
            });
        }

        const posts = readJsonFile(POSTS_FILE, []);

        if (!Array.isArray(posts)) {
            return res.status(500).json({
                error: "Некорректный формат posts.json."
            });
        }

        const newPost = {
            id: Date.now().toString(),
            title: title.trim(),
            platform:
                typeof platform === "string" && platform.trim()
                    ? platform.trim()
                    : "PC",
            imageUrl:
                typeof imageUrl === "string"
                    ? imageUrl.trim()
                    : "",
            content: content.trim(),
            pinned: Boolean(pinned),
            willPlay: 0,
            wontPlay: 0,
            createdAt: new Date().toISOString()
        };

        posts.push(newPost);

        writeJsonFile(POSTS_FILE, posts);

        res.status(201).json(newPost);
    } catch (error) {
        console.error("POST /api/posts:", error);

        res.status(500).json({
            error: "Не удалось создать новость."
        });
    }
});

app.post("/api/posts/:id/vote", (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body || {};

        if (
            type !== "willPlay" &&
            type !== "wontPlay"
        ) {
            return res.status(400).json({
                error: "Тип голоса должен быть willPlay или wontPlay."
            });
        }

        const posts = readJsonFile(POSTS_FILE, []);

        if (!Array.isArray(posts)) {
            return res.status(500).json({
                error: "Некорректный формат posts.json."
            });
        }

        const post = posts.find(
            item => String(item.id) === String(id)
        );

        if (!post) {
            return res.status(404).json({
                error: "Новость не найдена."
            });
        }

        post.willPlay = Math.max(
            0,
            normalizeNumber(post.willPlay, 0)
        );

        post.wontPlay = Math.max(
            0,
            normalizeNumber(post.wontPlay, 0)
        );

        if (type === "willPlay") {
            post.willPlay += 1;
        } else {
            post.wontPlay += 1;
        }

        writeJsonFile(POSTS_FILE, posts);

        res.json({
            success: true,
            id: post.id,
            willPlay: post.willPlay,
            wontPlay: post.wontPlay
        });
    } catch (error) {
        console.error("POST /api/posts/:id/vote:", error);

        res.status(500).json({
            error: "Не удалось сохранить голос."
        });
    }
});

app.delete("/api/posts/:id", requireAdmin, (req, res) => {
    try {
        const { id } = req.params;

        const posts = readJsonFile(POSTS_FILE, []);

        if (!Array.isArray(posts)) {
            return res.status(500).json({
                error: "Некорректный формат posts.json."
            });
        }

        const index = posts.findIndex(
            post => String(post.id) === String(id)
        );

        if (index === -1) {
            return res.status(404).json({
                error: "Новость не найдена."
            });
        }

        const deletedPost = posts.splice(index, 1)[0];

        writeJsonFile(POSTS_FILE, posts);

        res.json({
            success: true,
            deleted: deletedPost
        });
    } catch (error) {
        console.error("DELETE /api/posts/:id:", error);

        res.status(500).json({
            error: "Не удалось удалить новость."
        });
    }
});

/*
|--------------------------------------------------------------------------
| RELEASE CALENDAR
|--------------------------------------------------------------------------
*/

app.get("/api/releases", (req, res) => {
    try {
        const releases = readJsonFile(RELEASES_FILE, []);

        if (!Array.isArray(releases)) {
            return res.status(500).json({
                error: "Некорректный формат releases.json."
            });
        }

        res.json(releases);
    } catch (error) {
        console.error("GET /api/releases:", error);

        res.status(500).json({
            error: "Не удалось загрузить календарь релизов."
        });
    }
});

app.post("/api/releases", requireAdmin, (req, res) => {
    try {
        const release = sanitizeReleaseInput(req.body || {});

        if (!release.title) {
            return res.status(400).json({
                error: "Название игры обязательно."
            });
        }

        if (!release.releaseDate) {
            return res.status(400).json({
                error: "Дата выхода обязательна."
            });
        }

        if (!validateReleaseDate(release.releaseDate)) {
            return res.status(400).json({
                error: "Дата выхода должна быть корректной датой в формате YYYY-MM-DD."
            });
        }

        const releases = readJsonFile(RELEASES_FILE, []);

        if (!Array.isArray(releases)) {
            return res.status(500).json({
                error: "Некорректный формат releases.json."
            });
        }

        const newRelease = {
            id: Date.now().toString(),
            title: release.title,
            releaseDate: release.releaseDate,
            priceDigital: release.priceDigital,
            priceDisk: release.priceDisk,
            platforms: release.platforms,
            systemReq: release.systemReq,
            bgUrl: release.bgUrl,
            discount: release.discount,
            isMainHit: release.isMainHit,
            isArchived: release.isArchived,
            votesWillPlay: 0,
            votesWontPlay: 0
        };

        releases.push(newRelease);

        writeJsonFile(RELEASES_FILE, releases);

        res.status(201).json(newRelease);
    } catch (error) {
        console.error("POST /api/releases:", error);

        res.status(500).json({
            error: "Не удалось добавить игру в календарь."
        });
    }
});

app.post("/api/releases/:id/vote", (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body || {};

        if (
            type !== "willPlay" &&
            type !== "wontPlay"
        ) {
            return res.status(400).json({
                error: "Тип голоса должен быть willPlay или wontPlay."
            });
        }

        const releases = readJsonFile(RELEASES_FILE, []);

        if (!Array.isArray(releases)) {
            return res.status(500).json({
                error: "Некорректный формат releases.json."
            });
        }

        const release = releases.find(
            item => String(item.id) === String(id)
        );

        if (!release) {
            return res.status(404).json({
                error: "Игра не найдена."
            });
        }

        release.votesWillPlay = Math.max(
            0,
            normalizeNumber(release.votesWillPlay, 0)
        );

        release.votesWontPlay = Math.max(
            0,
            normalizeNumber(release.votesWontPlay, 0)
        );

        if (type === "willPlay") {
            release.votesWillPlay += 1;
        } else {
            release.votesWontPlay += 1;
        }

        writeJsonFile(RELEASES_FILE, releases);

        res.json({
            success: true,
            id: release.id,
            votesWillPlay: release.votesWillPlay,
            votesWontPlay: release.votesWontPlay
        });
    } catch (error) {
        console.error("POST /api/releases/:id/vote:", error);

        res.status(500).json({
            error: "Не удалось сохранить голос."
        });
    }
});

app.patch(
    "/api/releases/:id/archive",
    requireAdmin,
    (req, res) => {
        try {
            const { id } = req.params;

            const releases = readJsonFile(RELEASES_FILE, []);

            if (!Array.isArray(releases)) {
                return res.status(500).json({
                    error: "Некорректный формат releases.json."
                });
            }

            const release = releases.find(
                item => String(item.id) === String(id)
            );

            if (!release) {
                return res.status(404).json({
                    error: "Игра не найдена."
                });
            }

            release.isArchived = !Boolean(
                release.isArchived
            );

            writeJsonFile(RELEASES_FILE, releases);

            res.json({
                success: true,
                id: release.id,
                isArchived: release.isArchived,
                release
            });
        } catch (error) {
            console.error(
                "PATCH /api/releases/:id/archive:",
                error
            );

            res.status(500).json({
                error: "Не удалось изменить статус архива."
            });
        }
    }
);

app.delete(
    "/api/releases/:id",
    requireAdmin,
    (req, res) => {
        try {
            const { id } = req.params;

            const releases = readJsonFile(RELEASES_FILE, []);

            if (!Array.isArray(releases)) {
                return res.status(500).json({
                    error: "Некорректный формат releases.json."
                });
            }

            const index = releases.findIndex(
                release => String(release.id) === String(id)
            );

            if (index === -1) {
                return res.status(404).json({
                    error: "Игра не найдена."
                });
            }

            const deletedRelease = releases.splice(index, 1)[0];

            writeJsonFile(RELEASES_FILE, releases);

            res.json({
                success: true,
                deleted: deletedRelease
            });
        } catch (error) {
            console.error(
                "DELETE /api/releases/:id:",
                error
            );

            res.status(500).json({
                error: "Не удалось удалить игру из календаря."
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| SPA FALLBACK
|--------------------------------------------------------------------------
*/

app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            error: "API route not found."
        });
    }

    res.sendFile(
        path.join(PUBLIC_DIR, "index.html")
    );
});

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
    console.error("Необработанная ошибка:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        error: "Внутренняя ошибка сервера."
    });
});

/*
|--------------------------------------------------------------------------
| SERVER START
|--------------------------------------------------------------------------
*/

app.listen(PORT, "0.0.0.0", () => {
    console.log(`PlayPC server запущен на порту ${PORT}`);
    console.log(`Статика: ${PUBLIC_DIR}`);
    console.log(`Посты: ${POSTS_FILE}`);
    console.log(`Релизы: ${RELEASES_FILE}`);
});