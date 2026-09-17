const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const app = express();

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const FILES = {
  posts: path.join(ROOT_DIR, "posts.json"),
  releases: path.join(ROOT_DIR, "releases.json"),
  config: path.join(ROOT_DIR, "config.json"),
  quiz: path.join(ROOT_DIR, "quiz.json")
};

const DEFAULT_CONFIG = {
  password: "AdminPlayPC2026",
  siteName: "PlayPC",
  musicPlaylist: []
};

const DEFAULT_POSTS = [];
const DEFAULT_RELEASES = [];
const DEFAULT_QUIZ = {
  question: "",
  options: [],
  correctIndex: 0,
  answers: []
};

const JSON_LIMIT = "50mb";

app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function randomId() {
  return crypto.randomUUID();
}

function nowISO() {
  return new Date().toISOString();
}

function normalizeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureDirectory() {
  if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
  }
}

function createFileIfMissing(filePath, defaultValue) {
  /*
   * CRITICAL DATA-SAFETY RULE:
   * This function NEVER overwrites an existing file.
   * Existing data from previous deployments is always preserved.
   */
  if (fs.existsSync(filePath)) {
    return false;
  }

  const content = JSON.stringify(defaultValue, null, 2);
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function initializeDatabase() {
  ensureDirectory();

  createFileIfMissing(FILES.posts, DEFAULT_POSTS);
  createFileIfMissing(FILES.releases, DEFAULT_RELEASES);
  createFileIfMissing(FILES.config, DEFAULT_CONFIG);
  createFileIfMissing(FILES.quiz, DEFAULT_QUIZ);
}

function readJsonSync(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return clone(fallback);
    }

    const raw = fs.readFileSync(filePath, "utf8").trim();

    if (!raw) {
      return clone(fallback);
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(`Ошибка чтения ${path.basename(filePath)}:`, error.message);
    return clone(fallback);
  }
}

async function atomicWriteJson(filePath, data) {
  const tempPath =
    `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;

  const backupPath = `${filePath}.bak`;

  const serialized = JSON.stringify(data, null, 2) + "\n";

  /*
   * Atomic write:
   * 1. Write the complete new file to a temporary file.
   * 2. Validate that the temporary file contains valid JSON.
   * 3. Preserve a backup of the previous version.
   * 4. Rename the temporary file over the target.
   *
   * This prevents a crash during JSON writing from leaving a half-written DB.
   */
  try {
    await fsp.writeFile(tempPath, serialized, "utf8");

    const verification = await fsp.readFile(tempPath, "utf8");
    JSON.parse(verification);

    if (fs.existsSync(filePath)) {
      try {
        await fsp.copyFile(filePath, backupPath);
      } catch (backupError) {
        console.warn(
          `Не удалось создать backup ${path.basename(filePath)}:`,
          backupError.message
        );
      }
    }

    await fsp.rename(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        await fsp.unlink(tempPath);
      }
    } catch {}

    throw error;
  }
}

async function writeJsonAndSync(filePath, data) {
  await atomicWriteJson(filePath, data);
  await syncWithGitHub();
}

let syncPromise = Promise.resolve();
let syncQueued = false;

function isCloudEnvironment() {
  return Boolean(process.env.PORT);
}

function execGit(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd: ROOT_DIR,
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({
          stdout: stdout || "",
          stderr: stderr || ""
        });
      }
    );
  });
}

async function syncWithGitHub() {
  if (!isCloudEnvironment()) {
    console.log("GitHub sync: локальный запуск, push пропущен.");
    return;
  }

  if (syncQueued) {
    return syncPromise;
  }

  syncQueued = true;

  syncPromise = (async () => {
    try {
      await execGit(["config", "user.name", "ZenixServerBot"]);
      await execGit(["config", "user.email", "bot@playpc.ru"]);

      await execGit([
        "add",
        "posts.json",
        "releases.json",
        "config.json",
        "quiz.json"
      ]);

      let hasChanges = true;

      try {
        await execGit(["diff", "--cached", "--quiet"]);
        hasChanges = false;
      } catch {
        hasChanges = true;
      }

      if (!hasChanges) {
        console.log("GitHub sync: изменений для commit нет.");
        return;
      }

      await execGit([
        "commit",
        "-m",
        `Авто-обновление базы данных с сервера ${new Date().toISOString()}`
      ]);

      await execGit(["push", "origin", "main"]);

      console.log("GitHub sync: данные успешно сохранены.");
    } catch (error) {
      console.error("GitHub sync error:", error.message);

      if (error.stdout) {
        console.error(error.stdout);
      }

      if (error.stderr) {
        console.error(error.stderr);
      }
    } finally {
      syncQueued = false;
    }
  })();

  return syncPromise;
}

async function initializeDatabaseSafely() {
  initializeDatabase();

  /*
   * Never replace existing JSON data at startup.
   * We only repair a missing file.
   */
  for (const [name, filePath] of Object.entries(FILES)) {
    if (!fs.existsSync(filePath)) {
      console.warn(`Восстановлен отсутствующий файл базы: ${name}.json`);
    }
  }
}

function getConfig() {
  const config = readJsonSync(FILES.config, DEFAULT_CONFIG);

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return clone(DEFAULT_CONFIG);
  }

  return {
    ...DEFAULT_CONFIG,
    ...config,
    password:
      typeof config.password === "string" && config.password.length > 0
        ? config.password
        : DEFAULT_CONFIG.password,
    siteName:
      typeof config.siteName === "string" && config.siteName.length > 0
        ? config.siteName
        : DEFAULT_CONFIG.siteName,
    musicPlaylist: normalizePlaylist(config.musicPlaylist)
  };
}

function normalizePlaylist(playlist) {
  return safeArray(playlist)
    .map((track, index) => {
      if (typeof track === "string") {
        return {
          id: `track-${index + 1}`,
          title: `Трек ${index + 1}`,
          mp3Data: track
        };
      }

      if (!track || typeof track !== "object") {
        return null;
      }

      return {
        id:
          track.id !== undefined && track.id !== null
            ? normalizeString(track.id)
            : randomId(),
        title:
          normalizeString(track.title || track.name, `Трек ${index + 1}`),
        mp3Data:
          normalizeString(
            track.mp3Data || track.url || track.src,
            ""
          )
      };
    })
    .filter(Boolean);
}

function getPosts() {
  const posts = readJsonSync(FILES.posts, DEFAULT_POSTS);
  return Array.isArray(posts) ? posts : [];
}

function getReleases() {
  const releases = readJsonSync(FILES.releases, DEFAULT_RELEASES);
  return Array.isArray(releases) ? releases : [];
}

function getQuiz() {
  const quiz = readJsonSync(FILES.quiz, DEFAULT_QUIZ);

  if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) {
    return clone(DEFAULT_QUIZ);
  }

  return quiz;
}

function saveConfig(config) {
  return atomicWriteJson(FILES.config, {
    ...DEFAULT_CONFIG,
    ...config,
    musicPlaylist: normalizePlaylist(config.musicPlaylist)
  });
}

function getAdminPassword(req) {
  const headerPassword =
    req.headers["x-admin-password"] ||
    req.headers["x-password"];

  if (headerPassword) {
    return String(headerPassword);
  }

  if (req.body && req.body.password) {
    return String(req.body.password);
  }

  if (req.query && req.query.password) {
    return String(req.query.password);
  }

  return "";
}

function requireAdmin(req, res, next) {
  const suppliedPassword = getAdminPassword(req);
  const config = getConfig();

  if (
    !suppliedPassword ||
    suppliedPassword !== config.password
  ) {
    return res.status(401).json({
      success: false,
      error: "Неверный пароль"
    });
  }

  next();
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (
      ["true", "1", "yes", "on", "да"].includes(normalized)
    ) {
      return true;
    }

    if (
      ["false", "0", "no", "off", "нет"].includes(normalized)
    ) {
      return false;
    }
  }

  return Boolean(value);
}

function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePlatforms(platforms) {
  if (Array.isArray(platforms)) {
    return platforms
      .map((item) => normalizeString(item).trim())
      .filter(Boolean);
  }

  if (typeof platforms === "string") {
    return platforms
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function isFutureDate(value) {
  if (!value) return false;

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return false;
  }

  return time > Date.now();
}

function isPublishedPost(post) {
  if (!post || typeof post !== "object") return false;

  if (parseBoolean(post.isDraft, false)) {
    return false;
  }

  if (post.publishAt && isFutureDate(post.publishAt)) {
    return false;
  }

  return true;
}

function postForPublic(post) {
  const safe = { ...post };

  delete safe.password;
  delete safe.adminPassword;

  return safe;
}

function quizForPublic(quiz) {
  const safe = clone(quiz);

  delete safe.correctIndex;

  if (Array.isArray(safe.items)) {
    safe.items = safe.items.map((item) => {
      if (!item || typeof item !== "object") return item;

      const clean = { ...item };
      delete clean.correctIndex;
      delete clean.answerIndex;
      delete clean.correctAnswer;
      return clean;
    });
  }

  return safe;
}

function normalizePollOptions(poll) {
  if (!poll || typeof poll !== "object") return [];

  let options =
    poll.options ||
    poll.answers ||
    poll.choices ||
    [];

  if (!Array.isArray(options)) {
    return [];
  }

  return options.map((option) => {
    if (
      option !== null &&
      typeof option === "object"
    ) {
      return {
        text: normalizeString(
          option.text ||
          option.title ||
          option.label ||
          option.name,
          ""
        ),
        votes: parseNumber(
          option.votes ??
          option.count ??
          option.voteCount,
          0
        )
      };
    }

    return {
      text: normalizeString(option, ""),
      votes: 0
    };
  });
}

function getPollFromMemory() {
  if (!global.__playpcPoll) {
    global.__playpcPoll = {
      question: "",
      options: [],
      votes: []
    };
  }

  return global.__playpcPoll;
}

function normalizePoll() {
  const poll = getPollFromMemory();

  const options = normalizePollOptions(poll);

  if (options.length > 0) {
    return {
      question: normalizeString(
        poll.question ||
        poll.title ||
        poll.topic,
        ""
      ),
      options
    };
  }

  return {
    question: normalizeString(
      poll.question ||
      poll.title ||
      poll.topic,
      ""
    ),
    options: []
  };
}

function buildRelease(input, existing = {}) {
  const platforms = normalizePlatforms(input.platforms);

  return {
    id: existing.id || randomId(),
    title: normalizeString(input.title, existing.title || "Без названия"),
    releaseDate: normalizeString(
      input.releaseDate,
      existing.releaseDate || ""
    ),
    priceDigital: normalizeString(
      input.priceDigital,
      existing.priceDigital || ""
    ),
    priceDisk: normalizeString(
      input.priceDisk,
      existing.priceDisk || ""
    ),
    platforms,
    systemReq: normalizeString(
      input.systemReq,
      existing.systemReq || ""
    ),
    bgUrl: normalizeString(
      input.bgUrl,
      existing.bgUrl || ""
    ),
    discount: normalizeString(
      input.discount,
      existing.discount || ""
    ),
    isMainHit: parseBoolean(
      input.isMainHit,
      existing.isMainHit || false
    ),
    isArchived: parseBoolean(
      input.isArchived,
      existing.isArchived || false
    ),
    votesWillPlay: parseNumber(
      input.votesWillPlay,
      existing.votesWillPlay || 0
    ),
    votesWontPlay: parseNumber(
      input.votesWontPlay,
      existing.votesWontPlay || 0
    ),
    createdAt: existing.createdAt || nowISO(),
    updatedAt: nowISO()
  };
}

initializeDatabaseSafely()
  .then(() => {
    console.log("PlayPC database initialized safely.");
  })
  .catch((error) => {
    console.error("Database initialization error:", error);
  });

/* =========================================================
   CONFIG
========================================================= */

app.get("/api/config", (req, res) => {
  try {
    const config = getConfig();

    return res.json({
      siteName: config.siteName,
      musicPlaylist: normalizePlaylist(config.musicPlaylist)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Не удалось загрузить конфигурацию"
    });
  }
});

app.post("/api/config/manage", requireAdmin, async (req, res) => {
  try {
    const current = getConfig();

    const siteName =
      req.body.siteName !== undefined
        ? normalizeString(req.body.siteName).trim() || "PlayPC"
        : current.siteName;

    let newPassword = current.password;

    if (
      req.body.newPassword !== undefined &&
      normalizeString(req.body.newPassword).trim()
    ) {
      newPassword = normalizeString(req.body.newPassword).trim();
    }

    const musicPlaylist =
      req.body.musicPlaylist !== undefined
        ? normalizePlaylist(req.body.musicPlaylist)
        : current.musicPlaylist;

    const updatedConfig = {
      ...current,
      siteName,
      password: newPassword,
      musicPlaylist
    };

    await writeJsonAndSync(FILES.config, updatedConfig);

    return res.json({
      success: true,
      message: "Настройки сохранены",
      siteName: updatedConfig.siteName,
      musicPlaylist: updatedConfig.musicPlaylist
    });
  } catch (error) {
    console.error("Config manage error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось сохранить настройки"
    });
  }
});

/* =========================================================
   MUSIC
========================================================= */

app.get("/api/music", (req, res) => {
  try {
    const config = getConfig();

    return res.json({
      success: true,
      musicPlaylist: normalizePlaylist(config.musicPlaylist)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Не удалось загрузить музыку"
    });
  }
});

app.post("/api/music/manage", requireAdmin, async (req, res) => {
  try {
    const config = getConfig();

    const incomingPlaylist =
      req.body.musicPlaylist !== undefined
        ? normalizePlaylist(req.body.musicPlaylist)
        : config.musicPlaylist;

    const updatedConfig = {
      ...config,
      musicPlaylist: incomingPlaylist
    };

    await writeJsonAndSync(FILES.config, updatedConfig);

    return res.json({
      success: true,
      musicPlaylist: updatedConfig.musicPlaylist
    });
  } catch (error) {
    console.error("Music manage error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось сохранить плейлист"
    });
  }
});

app.delete("/api/admin/music/:id", requireAdmin, async (req, res) => {
  try {
    const config = getConfig();
    const trackId = String(req.params.id);

    const playlist = normalizePlaylist(config.musicPlaylist);

    const index = playlist.findIndex(
      (track) => String(track.id) === trackId
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: "Трек не найден"
      });
    }

    const deletedTrack = playlist[index];

    playlist.splice(index, 1);

    const updatedConfig = {
      ...config,
      musicPlaylist: playlist
    };

    await writeJsonAndSync(FILES.config, updatedConfig);

    return res.json({
      success: true,
      message: "Трек полностью удалён",
      deletedTrack,
      musicPlaylist: playlist
    });
  } catch (error) {
    console.error("Delete music error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось удалить трек"
    });
  }
});

/* =========================================================
   ADMIN LOGIN CHECK
========================================================= */

app.get("/api/admin/check", requireAdmin, (req, res) => {
  return res.json({
    success: true,
    authenticated: true
  });
});

/* =========================================================
   POSTS / NEWS
========================================================= */

app.get("/api/posts", (req, res) => {
  try {
    const posts = getPosts();

    const isAdminRequest =
      getAdminPassword(req) &&
      getAdminPassword(req) === getConfig().password;

    if (isAdminRequest) {
      return res.json(posts);
    }

    return res.json(
      posts
        .filter(isPublishedPost)
        .map(postForPublic)
    );
  } catch (error) {
    console.error("GET posts error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось загрузить новости"
    });
  }
});

app.get("/api/posts/:id", (req, res) => {
  try {
    const posts = getPosts();
    const post = posts.find(
      (item) => String(item.id) === String(req.params.id)
    );

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Новость не найдена"
      });
    }

    const isAdminRequest =
      getAdminPassword(req) &&
      getAdminPassword(req) === getConfig().password;

    if (!isAdminRequest && !isPublishedPost(post)) {
      return res.status(404).json({
        success: false,
        error: "Новость не найдена"
      });
    }

    return res.json(
      isAdminRequest ? post : postForPublic(post)
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Не удалось загрузить новость"
    });
  }
});

app.post("/api/posts", requireAdmin, async (req, res) => {
  try {
    const posts = getPosts();

    const post = {
      id: randomId(),
      title: normalizeString(req.body.title, "Без заголовка"),
      platform: normalizeString(req.body.platform, "PC"),
      imageUrl: normalizeString(req.body.imageUrl, ""),
      content: normalizeString(req.body.content, ""),
      moodTag: normalizeString(req.body.moodTag, ""),
      publishAt: normalizeString(req.body.publishAt, ""),
      pinned: parseBoolean(req.body.pinned, false),
      isDraft: parseBoolean(req.body.isDraft, false),
      createdAt: nowISO(),
      updatedAt: null,
      clicksShare: 0,
      clicksBookmark: 0,
      clicksLike: 0,
      clicksDislike: 0,
      likes: 0,
      dislikes: 0
    };

    posts.unshift(post);

    await writeJsonAndSync(FILES.posts, posts);

    return res.status(201).json({
      success: true,
      post
    });
  } catch (error) {
    console.error("Create post error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось создать новость"
    });
  }
});

app.put("/api/posts/:id", requireAdmin, async (req, res) => {
  try {
    const posts = getPosts();

    const index = posts.findIndex(
      (item) => String(item.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: "Новость не найдена"
      });
    }

    const current = posts[index];

    const updated = {
      ...current,
      title:
        req.body.title !== undefined
          ? normalizeString(req.body.title)
          : current.title,
      platform:
        req.body.platform !== undefined
          ? normalizeString(req.body.platform)
          : current.platform,
      imageUrl:
        req.body.imageUrl !== undefined
          ? normalizeString(req.body.imageUrl)
          : current.imageUrl,
      content:
        req.body.content !== undefined
          ? normalizeString(req.body.content)
          : current.content,
      moodTag:
        req.body.moodTag !== undefined
          ? normalizeString(req.body.moodTag)
          : current.moodTag,
      publishAt:
        req.body.publishAt !== undefined
          ? normalizeString(req.body.publishAt)
          : current.publishAt,
      pinned:
        req.body.pinned !== undefined
          ? parseBoolean(req.body.pinned)
          : Boolean(current.pinned),
      isDraft:
        req.body.isDraft !== undefined
          ? parseBoolean(req.body.isDraft)
          : Boolean(current.isDraft),
      updatedAt: nowISO()
    };

    posts[index] = updated;

    await writeJsonAndSync(FILES.posts, posts);

    return res.json({
      success: true,
      post: updated
    });
  } catch (error) {
    console.error("Update post error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось изменить новость"
    });
  }
});

app.patch("/api/posts/:id", requireAdmin, async (req, res) => {
  try {
    const posts = getPosts();

    const index = posts.findIndex(
      (item) => String(item.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: "Новость не найдена"
      });
    }

    const current = posts[index];

    const updated = {
      ...current,
      ...req.body,
      id: current.id,
      createdAt: current.createdAt,
      clicksShare: current.clicksShare || 0,
      clicksBookmark: current.clicksBookmark || 0,
      clicksLike: current.clicksLike || 0,
      clicksDislike: current.clicksDislike || 0,
      likes: current.likes || 0,
      dislikes: current.dislikes || 0,
      updatedAt: nowISO()
    };

    posts[index] = updated;

    await writeJsonAndSync(FILES.posts, posts);

    return res.json({
      success: true,
      post: updated
    });
  } catch (error) {
    console.error("Patch post error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось изменить новость"
    });
  }
});

app.delete("/api/posts/:id", requireAdmin, async (req, res) => {
  try {
    const posts = getPosts();

    const index = posts.findIndex(
      (item) => String(item.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: "Новость не найдена"
      });
    }

    const deleted = posts.splice(index, 1)[0];

    await writeJsonAndSync(FILES.posts, posts);

    return res.json({
      success: true,
      deleted
    });
  } catch (error) {
    console.error("Delete post error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось удалить новость"
    });
  }
});

app.post("/api/posts/:id/click", async (req, res) => {
  try {
    const posts = getPosts();

    const index = posts.findIndex(
      (item) => String(item.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: "Новость не найдена"
      });
    }

    const type = normalizeString(req.body.type).toLowerCase();

    const post = posts[index];

    if (typeof post.clicksShare !== "number") {
      post.clicksShare = parseNumber(post.clicksShare, 0);
    }

    if (typeof post.clicksBookmark !== "number") {
      post.clicksBookmark = parseNumber(post.clicksBookmark, 0);
    }

    if (typeof post.clicksLike !== "number") {
      post.clicksLike = parseNumber(post.clicksLike, 0);
    }

    if (typeof post.clicksDislike !== "number") {
      post.clicksDislike = parseNumber(post.clicksDislike, 0);
    }

    if (typeof post.likes !== "number") {
      post.likes = parseNumber(post.likes, 0);
    }

    if (typeof post.dislikes !== "number") {
      post.dislikes = parseNumber(post.dislikes, 0);
    }

    switch (type) {
      case "share":
        post.clicksShare += 1;
        break;

      case "bookmark":
      case "cart":
        post.clicksBookmark += 1;
        break;

      case "like":
      case "cool":
        post.clicksLike += 1;
        post.likes += 1;
        break;

      case "dislike":
      case "miss":
        post.clicksDislike += 1;
        post.dislikes += 1;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: "Неизвестный тип действия"
        });
    }

    posts[index] = post;

    await writeJsonAndSync(FILES.posts, posts);

    return res.json({
      success: true,
      id: post.id,
      type,
      clicksShare: post.clicksShare,
      clicksBookmark: post.clicksBookmark,
      clicksLike: post.clicksLike,
      clicksDislike: post.clicksDislike,
      likes: post.likes,
      dislikes: post.dislikes
    });
  } catch (error) {
    console.error("Post click error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось сохранить действие"
    });
  }
});

/* =========================================================
   RELEASE CALENDAR
========================================================= */

app.get("/api/releases", (req, res) => {
  try {
    const releases = getReleases();

    return res.json(
      releases.filter(
        (release) => !parseBoolean(release.isArchived, false)
      )
    );
  } catch (error) {
    console.error("GET releases error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось загрузить релизы"
    });
  }
});

app.get("/api/releases/archive", requireAdmin, (req, res) => {
  try {
    const releases = getReleases();

    return res.json(
      releases.filter((release) =>
        parseBoolean(release.isArchived, false)
      )
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Не удалось загрузить архив"
    });
  }
});

app.post("/api/releases", requireAdmin, async (req, res) => {
  try {
    const releases = getReleases();

    const release = buildRelease(req.body);

    releases.push(release);

    releases.sort((a, b) => {
      const dateA = new Date(a.releaseDate).getTime();
      const dateB = new Date(b.releaseDate).getTime();

      if (!Number.isFinite(dateA)) return 1;
      if (!Number.isFinite(dateB)) return -1;

      return dateA - dateB;
    });

    await writeJsonAndSync(FILES.releases, releases);

    return res.status(201).json({
      success: true,
      release
    });
  } catch (error) {
    console.error("Create release error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось добавить релиз"
    });
  }
});

app.patch(
  "/api/releases/:id/archive",
  requireAdmin,
  async (req, res) => {
    try {
      const releases = getReleases();

      const index = releases.findIndex(
        (item) => String(item.id) === String(req.params.id)
      );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          error: "Релиз не найден"
        });
      }

      releases[index].isArchived =
        req.body.isArchived !== undefined
          ? parseBoolean(req.body.isArchived)
          : !parseBoolean(releases[index].isArchived);

      releases[index].updatedAt = nowISO();

      await writeJsonAndSync(FILES.releases, releases);

      return res.json({
        success: true,
        release: releases[index]
      });
    } catch (error) {
      console.error("Archive release error:", error);

      return res.status(500).json({
        success: false,
        error: "Не удалось изменить архивный статус"
      });
    }
  }
);

app.put("/api/releases/:id", requireAdmin, async (req, res) => {
  try {
    const releases = getReleases();

    const index = releases.findIndex(
      (item) => String(item.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: "Релиз не найден"
      });
    }

    const updated = buildRelease(
      req.body,
      releases[index]
    );

    releases[index] = updated;

    await writeJsonAndSync(FILES.releases, releases);

    return res.json({
      success: true,
      release: updated
    });
  } catch (error) {
    console.error("Update release error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось изменить релиз"
    });
  }
});

app.delete("/api/releases/:id", requireAdmin, async (req, res) => {
  try {
    const releases = getReleases();

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

    await writeJsonAndSync(FILES.releases, releases);

    return res.json({
      success: true,
      deleted
    });
  } catch (error) {
    console.error("Delete release error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось удалить релиз"
    });
  }
});

app.post("/api/releases/:id/vote", async (req, res) => {
  try {
    const releases = getReleases();

    const index = releases.findIndex(
      (item) => String(item.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: "Релиз не найден"
      });
    }

    const release = releases[index];

    if (parseBoolean(release.isArchived, false)) {
      return res.status(400).json({
        success: false,
        error: "Архивный релиз недоступен для голосования"
      });
    }

    if (typeof release.votesWillPlay !== "number") {
      release.votesWillPlay = parseNumber(
        release.votesWillPlay,
        0
      );
    }

    if (typeof release.votesWontPlay !== "number") {
      release.votesWontPlay = parseNumber(
        release.votesWontPlay,
        0
      );
    }

    const vote = normalizeString(
      req.body.vote ||
      req.body.choice ||
      req.body.answer
    ).toLowerCase();

    if (
      vote === "willplay" ||
      vote === "will_play" ||
      vote === "yes" ||
      vote === "play" ||
      vote === "1"
    ) {
      release.votesWillPlay += 1;
    } else if (
      vote === "wontplay" ||
      vote === "wont_play" ||
      vote === "no" ||
      vote === "skip" ||
      vote === "0"
    ) {
      release.votesWontPlay += 1;
    } else {
      return res.status(400).json({
        success: false,
        error: "Неизвестный вариант голосования"
      });
    }

    release.updatedAt = nowISO();

    releases[index] = release;

    await writeJsonAndSync(FILES.releases, releases);

    return res.json({
      success: true,
      releaseId: release.id,
      votesWillPlay: release.votesWillPlay,
      votesWontPlay: release.votesWontPlay,
      willPlay: release.votesWillPlay,
      wontPlay: release.votesWontPlay
    });
  } catch (error) {
    console.error("Release vote error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось сохранить голос"
    });
  }
});

/* =========================================================
   QUIZ
========================================================= */

app.get("/api/quiz", (req, res) => {
  try {
    const quiz = getQuiz();

    return res.json(quizForPublic(quiz));
  } catch (error) {
    console.error("GET quiz error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось загрузить викторину"
    });
  }
});

app.post("/api/quiz/manage", requireAdmin, async (req, res) => {
  try {
    const current = getQuiz();

    const updatedQuiz = {
      ...current,
      ...req.body
    };

    if (req.body.question !== undefined) {
      updatedQuiz.question = normalizeString(req.body.question);
    }

    if (req.body.options !== undefined) {
      updatedQuiz.options = safeArray(req.body.options).map(
        (item) => normalizeString(item)
      );
    }

    if (req.body.answers !== undefined) {
      updatedQuiz.answers = safeArray(req.body.answers).map(
        (item) => normalizeString(item)
      );
    }

    if (req.body.correctIndex !== undefined) {
      updatedQuiz.correctIndex = parseNumber(
        req.body.correctIndex,
        0
      );
    }

    if (Array.isArray(req.body.items)) {
      updatedQuiz.items = req.body.items;
    }

    updatedQuiz.updatedAt = nowISO();

    await writeJsonAndSync(FILES.quiz, updatedQuiz);

    return res.json({
      success: true,
      quiz: quizForPublic(updatedQuiz)
    });
  } catch (error) {
    console.error("Quiz manage error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось сохранить викторину"
    });
  }
});

app.post("/api/quiz/answer", async (req, res) => {
  try {
    const quiz = getQuiz();

    const answerIndex = parseNumber(
      req.body.answerIndex !== undefined
        ? req.body.answerIndex
        : req.body.index,
      -1
    );

    let correct = false;

    if (
      Number.isInteger(answerIndex) &&
      Number.isInteger(Number(quiz.correctIndex))
    ) {
      correct =
        answerIndex === Number(quiz.correctIndex);
    }

    return res.json({
      success: true,
      correct
    });
  } catch (error) {
    console.error("Quiz answer error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось проверить ответ"
    });
  }
});

/* =========================================================
   POLL
========================================================= */

app.get("/api/poll", (req, res) => {
  try {
    return res.json({
      success: true,
      poll: normalizePoll()
    });
  } catch (error) {
    console.error("GET poll error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось загрузить опрос"
    });
  }
});

app.post("/api/poll/manage", requireAdmin, async (req, res) => {
  try {
    const existing = getPollFromMemory();

    const question =
      req.body.question !== undefined
        ? normalizeString(req.body.question)
        : normalizeString(
            req.body.title ||
            req.body.topic,
            existing.question || ""
          );

    const rawOptions =
      req.body.options !== undefined
        ? req.body.options
        : req.body.answers !== undefined
          ? req.body.answers
          : existing.options;

    let options = [];

    if (Array.isArray(rawOptions)) {
      options = rawOptions.map((option, index) => {
        if (
          option !== null &&
          typeof option === "object"
        ) {
          return {
            text: normalizeString(
              option.text ||
              option.title ||
              option.label ||
              option.name,
              `Вариант ${index + 1}`
            ),
            votes: req.body.resetVotes
              ? 0
              : parseNumber(
                  option.votes ||
                  option.count ||
                  option.voteCount,
                  0
                )
          };
        }

        const oldOption =
          safeArray(existing.options)[index];

        const oldVotes =
          oldOption &&
          typeof oldOption === "object"
            ? parseNumber(oldOption.votes, 0)
            : 0;

        return {
          text: normalizeString(
            option,
            `Вариант ${index + 1}`
          ),
          votes: req.body.resetVotes
            ? 0
            : oldVotes
        };
      });
    }

    if (parseBoolean(req.body.resetVotes, false)) {
      options = options.map((option) => ({
        ...option,
        votes: 0
      }));
    }

    global.__playpcPoll = {
      question,
      options,
      updatedAt: nowISO()
    };

    /*
     * Poll is intentionally kept in memory because the historical
     * PlayPC data model did not include poll.json.
     * All persistent JSON databases remain protected by the
     * atomic-write + GitHub synchronization system.
     */

    return res.json({
      success: true,
      poll: normalizePoll()
    });
  } catch (error) {
    console.error("Poll manage error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось сохранить опрос"
    });
  }
});

app.post("/api/poll/vote", async (req, res) => {
  try {
    const poll = getPollFromMemory();

    const rawIndex =
      req.body.optionIndex !== undefined
        ? req.body.optionIndex
        : req.body.index !== undefined
          ? req.body.index
          : req.body.answerIndex;

    const optionIndex = parseNumber(rawIndex, -1);

    if (
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= safeArray(poll.options).length
    ) {
      return res.status(400).json({
        success: false,
        error: "Неверный вариант ответа"
      });
    }

    if (
      poll.options[optionIndex] === null ||
      typeof poll.options[optionIndex] !== "object"
    ) {
      poll.options[optionIndex] = {
        text: normalizeString(
          poll.options[optionIndex],
          ""
        ),
        votes: 0
      };
    }

    poll.options[optionIndex].votes =
      parseNumber(
        poll.options[optionIndex].votes,
        0
      ) + 1;

    poll.updatedAt = nowISO();

    const options = normalizePollOptions(poll);

    const totalVotes = options.reduce(
      (sum, option) => sum + parseNumber(option.votes, 0),
      0
    );

    return res.json({
      success: true,
      poll: {
        question: poll.question,
        options,
        totalVotes
      }
    });
  } catch (error) {
    console.error("Poll vote error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось сохранить голос"
    });
  }
});

/* =========================================================
   ADMIN: CLEAR ALL
========================================================= */

app.post("/api/admin/clear-all", requireAdmin, async (req, res) => {
  try {
    await atomicWriteJson(FILES.posts, []);
    await atomicWriteJson(FILES.releases, []);

    await syncWithGitHub();

    return res.json({
      success: true,
      message: "Новости и релизы очищены"
    });
  } catch (error) {
    console.error("Clear all error:", error);

    return res.status(500).json({
      success: false,
      error: "Не удалось очистить данные"
    });
  }
});

/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", (req, res) => {
  return res.json({
    success: true,
    status: "online",
    service: "PlayPC",
    time: nowISO()
  });
});

/* =========================================================
   SPA FALLBACK
========================================================= */

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  const indexPath = path.join(PUBLIC_DIR, "index.html");

  if (!fs.existsSync(indexPath)) {
    return res.status(404).send("PlayPC frontend not found.");
  }

  return res.sendFile(indexPath);
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  if (res.headersSent) {
    return next(err);
  }

  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "Размер данных слишком большой. Максимум 50MB."
    });
  }

  return res.status(500).json({
    success: false,
    error: "Внутренняя ошибка сервера"
  });
});

/* =========================================================
   START
========================================================= */

const server = app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("======================================");
    console.log("          PLAYPC SERVER ONLINE        ");
    console.log("======================================");
    console.log(`Port: ${PORT}`);
    console.log(`Root: ${ROOT_DIR}`);
    console.log(`Public: ${PUBLIC_DIR}`);
    console.log("JSON limit: 50MB");
    console.log("Database overwrite protection: ON");
    console.log("Atomic JSON writes: ON");
    console.log("GitHub auto-sync: ON");
    console.log("======================================");
  }
);

server.on("error", (error) => {
  console.error("HTTP server error:", error);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Saving pending changes...");

  try {
    await syncWithGitHub();
  } catch (error) {
    console.error("Final sync error:", error);
  }

  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Saving pending changes...");

  try {
    await syncWithGitHub();
  } catch (error) {
    console.error("Final sync error:", error);
  }

  server.close(() => {
    process.exit(0);
  });
});