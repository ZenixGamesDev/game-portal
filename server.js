const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   PLAYPC — SERVER
   ========================================================= */

const ADMIN_PASSWORD = "AdminPlayPC2026";

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const POSTS_FILE = path.join(ROOT, "posts.json");
const RELEASES_FILE = path.join(ROOT, "releases.json");
const CONFIG_FILE = path.join(ROOT, "config.json");
const QUIZ_FILE = path.join(ROOT, "quiz.json");
const POLL_FILE = path.join(ROOT, "poll.json");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(PUBLIC_DIR));

/* =========================================================
   DEFAULT DATA
   ========================================================= */

const DEFAULT_FOOTER_TEXT =
  "Юридическая информация • Сентябрь 2026\n" +
  "PlayPC в рамках функций данного интерфейса не использует cookies и не собирает персональные данные пользователей. " +
  "Данные не передаются третьим лицам через пользовательский интерфейс сайта. " +
  "Эксплуатация проекта должна осуществляться с учётом применимого законодательства Российской Федерации и Азербайджанской Республики.";

const DEFAULT_CONFIG = {
  password: ADMIN_PASSWORD,
  siteName: "PlayPC",
  musicPlaylist: [],
  footerText: DEFAULT_FOOTER_TEXT
};

const DEFAULT_POLL = {
  question: "Какую игру вы ждёте больше всего?",
  options: [
    "Grand Theft Auto VI",
    "Resident Evil",
    "Assassin's Creed",
    "Другую игру"
  ],
  votes: [0, 0, 0, 0]
};

const DEFAULT_QUIZ = {
  question: "Угадайте игру",
  image: "",
  options: [
    "The Last of Us",
    "Uncharted 4",
    "Far Cry 6",
    "Cyberpunk 2077"
  ],
  correctIndex: 0
};

/* =========================================================
   FILE HELPERS
   ========================================================= */

function ensureFile(file, defaultValue) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2), "utf8");
    }
  } catch (error) {
    console.error(`Ошибка создания ${path.basename(file)}:`, error);
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      ensureFile(file, fallback);
      return JSON.parse(JSON.stringify(fallback));
    }

    const raw = fs.readFileSync(file, "utf8").trim();

    if (!raw) {
      return JSON.parse(JSON.stringify(fallback));
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(`Ошибка чтения ${path.basename(file)}:`, error);
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function ensureAllFiles() {
  ensureFile(POSTS_FILE, []);
  ensureFile(RELEASES_FILE, []);
  ensureFile(CONFIG_FILE, DEFAULT_CONFIG);
  ensureFile(QUIZ_FILE, DEFAULT_QUIZ);
  ensureFile(POLL_FILE, DEFAULT_POLL);

  const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

  if (!config || typeof config !== "object") {
    writeJson(CONFIG_FILE, DEFAULT_CONFIG);
    return;
  }

  if (typeof config.siteName !== "string") {
    config.siteName = "PlayPC";
  }

  if (!Array.isArray(config.musicPlaylist)) {
    config.musicPlaylist = [];
  }

  if (typeof config.footerText !== "string") {
    config.footerText = DEFAULT_FOOTER_TEXT;
  }

  config.password = ADMIN_PASSWORD;

  writeJson(CONFIG_FILE, config);
}

ensureAllFiles();

/* =========================================================
   UTILS
   ========================================================= */

function createId(prefix = "") {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9)
  );
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function normalizeBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  if (typeof value === "string") {
    return value === "true" || value === "1" || value === "on";
  }

  return Boolean(value);
}

function getPasswordFromRequest(req) {
  if (req.body && typeof req.body.password === "string") {
    return req.body.password;
  }

  if (typeof req.headers["x-admin-password"] === "string") {
    return req.headers["x-admin-password"];
  }

  if (typeof req.query.password === "string") {
    return req.query.password;
  }

  return "";
}

function isAdmin(req) {
  return getPasswordFromRequest(req) === ADMIN_PASSWORD;
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

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    error: message
  });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

/* =========================================================
   GITHUB SYNC
   ========================================================= */

function syncWithGitHub() {
  if (!process.env.PORT) {
    return;
  }

  const files = [
    "posts.json",
    "releases.json",
    "config.json",
    "quiz.json",
    "poll.json"
  ];

  const addCommand = `git add ${files.join(" ")}`;

  exec(addCommand, { cwd: ROOT }, (addError) => {
    if (addError) {
      console.error("GitHub sync: ошибка git add:", addError.message);
      return;
    }

    exec(
      'git diff --cached --quiet',
      { cwd: ROOT },
      (diffError) => {
        if (!diffError) {
          return;
        }

        exec(
          'git commit -m "PlayPC automatic update"',
          { cwd: ROOT },
          (commitError) => {
            if (commitError) {
              console.error(
                "GitHub sync: ошибка git commit:",
                commitError.message
              );
              return;
            }

            exec(
              "git push",
              { cwd: ROOT },
              (pushError, stdout, stderr) => {
                if (pushError) {
                  console.error(
                    "GitHub sync: ошибка git push:",
                    pushError.message
                  );
                  return;
                }

                if (stdout) {
                  console.log("GitHub sync:", stdout.trim());
                }

                if (stderr) {
                  console.log("GitHub sync:", stderr.trim());
                }
              }
            );
          }
        );
      }
    );
  });
}

/* =========================================================
   ADMIN LOGIN
   ========================================================= */

app.post("/api/admin/login", (req, res) => {
  const password = req.body ? req.body.password : undefined;

  if (password === ADMIN_PASSWORD) {
    return res.status(200).json({
      success: true,
      token: "authenticated"
    });
  }

  return res.status(401).json({
    success: false,
    error: "Сервер отклонил пароль"
  });
});

/* =========================================================
   CONFIG
   ========================================================= */

app.get("/api/config", (req, res) => {
  const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

  res.json({
    siteName:
      typeof config.siteName === "string"
        ? config.siteName
        : DEFAULT_CONFIG.siteName,

    musicPlaylist: Array.isArray(config.musicPlaylist)
      ? config.musicPlaylist
      : [],

    footerText:
      typeof config.footerText === "string"
        ? config.footerText
        : DEFAULT_FOOTER_TEXT
  });
});

app.post("/api/admin/config", requireAdmin, (req, res) => {
  const current = readJson(CONFIG_FILE, DEFAULT_CONFIG);

  if (typeof req.body.siteName === "string") {
    current.siteName = req.body.siteName.trim() || "PlayPC";
  }

  if (typeof req.body.footerText === "string") {
    current.footerText = req.body.footerText;
  }

  if (Array.isArray(req.body.musicPlaylist)) {
    current.musicPlaylist = req.body.musicPlaylist;
  }

  current.password = ADMIN_PASSWORD;

  writeJson(CONFIG_FILE, current);
  syncWithGitHub();

  res.status(200).json({
    success: true,
    config: {
      siteName: current.siteName,
      musicPlaylist: current.musicPlaylist,
      footerText: current.footerText
    }
  });
});

/* =========================================================
   POSTS
   ========================================================= */

function normalizePost(post) {
  const analytics = post.analytics || {};

  return {
    ...post,

    id: post.id || createId("post_"),

    title: normalizeText(post.title, "Без названия"),
    platform: normalizeText(post.platform, "PC"),
    image: normalizeText(post.image, ""),
    content: normalizeText(post.content, ""),
    moodTag: normalizeText(post.moodTag, ""),
    publishAt: normalizeText(post.publishAt, ""),
    isDraft: normalizeBoolean(post.isDraft),
    pinned: normalizeBoolean(post.pinned),

    createdAt: normalizeText(post.createdAt, nowIso()),
    updatedAt: normalizeText(post.updatedAt, nowIso()),

    analytics: {
      likes: normalizeNumber(analytics.likes),
      dislikes: normalizeNumber(analytics.dislikes),
      shares: normalizeNumber(analytics.shares),
      bookmarks: normalizeNumber(analytics.bookmarks),
      clicks: normalizeNumber(analytics.clicks)
    }
  };
}

app.get("/api/posts", (req, res) => {
  let posts = readJson(POSTS_FILE, []);

  if (!Array.isArray(posts)) {
    posts = [];
  }

  posts = posts.map(normalizePost);

  const adminRequest =
    req.query.admin === "1" ||
    req.query.admin === "true" ||
    isAdmin(req);

  if (!adminRequest) {
    const currentTime = Date.now();

    posts = posts.filter((post) => {
      if (post.isDraft) {
        return false;
      }

      if (!post.publishAt) {
        return true;
      }

      const publishTime = new Date(post.publishAt).getTime();

      if (!Number.isFinite(publishTime)) {
        return true;
      }

      return publishTime <= currentTime;
    });
  }

  posts.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }

    return (
      new Date(b.publishAt || b.createdAt).getTime() -
      new Date(a.publishAt || a.createdAt).getTime()
    );
  });

  if (adminRequest && !isAdmin(req)) {
    return res.status(401).json({
      success: false,
      error: "Сервер отклонил пароль"
    });
  }

  res.json(posts);
});

app.post("/api/posts", requireAdmin, (req, res) => {
  const posts = readJson(POSTS_FILE, []);

  const post = normalizePost({
    id: createId("post_"),
    title: req.body.title,
    platform: req.body.platform,
    image: req.body.image || req.body.imageUrl,
    content: req.body.content,
    moodTag: req.body.moodTag,
    publishAt: req.body.publishAt,
    isDraft: req.body.isDraft,
    pinned: req.body.pinned,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    analytics: {
      likes: 0,
      dislikes: 0,
      shares: 0,
      bookmarks: 0,
      clicks: 0
    }
  });

  posts.push(post);
  writeJson(POSTS_FILE, posts);
  syncWithGitHub();

  res.status(201).json({
    success: true,
    post
  });
});

app.put("/api/posts/:id", requireAdmin, (req, res) => {
  const posts = readJson(POSTS_FILE, []);
  const index = posts.findIndex(
    (post) => String(post.id) === String(req.params.id)
  );

  if (index === -1) {
    return sendError(res, 404, "Статья не найдена");
  }

  const oldPost = normalizePost(posts[index]);

  const updatedPost = normalizePost({
    ...oldPost,

    title:
      req.body.title !== undefined ? req.body.title : oldPost.title,

    platform:
      req.body.platform !== undefined
        ? req.body.platform
        : oldPost.platform,

    image:
      req.body.image !== undefined
        ? req.body.image
        : req.body.imageUrl !== undefined
        ? req.body.imageUrl
        : oldPost.image,

    content:
      req.body.content !== undefined
        ? req.body.content
        : oldPost.content,

    moodTag:
      req.body.moodTag !== undefined
        ? req.body.moodTag
        : oldPost.moodTag,

    publishAt:
      req.body.publishAt !== undefined
        ? req.body.publishAt
        : oldPost.publishAt,

    isDraft:
      req.body.isDraft !== undefined
        ? req.body.isDraft
        : oldPost.isDraft,

    pinned:
      req.body.pinned !== undefined
        ? req.body.pinned
        : oldPost.pinned,

    updatedAt: nowIso()
  });

  posts[index] = updatedPost;

  writeJson(POSTS_FILE, posts);
  syncWithGitHub();

  res.json({
    success: true,
    post: updatedPost
  });
});

app.delete("/api/posts/:id", requireAdmin, (req, res) => {
  const posts = readJson(POSTS_FILE, []);

  const index = posts.findIndex(
    (post) => String(post.id) === String(req.params.id)
  );

  if (index === -1) {
    return sendError(res, 404, "Статья не найдена");
  }

  const deleted = posts.splice(index, 1)[0];

  writeJson(POSTS_FILE, posts);
  syncWithGitHub();

  res.json({
    success: true,
    deleted
  });
});

app.post("/api/posts/:id/click", (req, res) => {
  const posts = readJson(POSTS_FILE, []);

  const index = posts.findIndex(
    (post) => String(post.id) === String(req.params.id)
  );

  if (index === -1) {
    return sendError(res, 404, "Статья не найдена");
  }

  const post = normalizePost(posts[index]);
  const type = normalizeText(req.body.type).toLowerCase();

  if (
    type === "like" ||
    type === "dislike" ||
    type === "share" ||
    type === "bookmark"
  ) {
    post.analytics[type] += 1;
    post.analytics.clicks += 1;
  } else {
    post.analytics.clicks += 1;
  }

  posts[index] = post;

  writeJson(POSTS_FILE, posts);

  res.json({
    success: true,
    analytics: post.analytics
  });
});

/* =========================================================
   RELEASES
   ========================================================= */

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

  return ["PC"];
}

function normalizeRelease(release) {
  return {
    ...release,

    id: release.id || createId("release_"),

    title: normalizeText(release.title, "Без названия"),
    platforms: normalizePlatforms(
      release.platforms || release.platform
    ),

    releaseDate: normalizeText(
      release.releaseDate || release.date,
      ""
    ),

    price: normalizeNumber(release.price),

    background:
      normalizeText(
        release.background || release.image || release.imageUrl,
        ""
      ),

    description: normalizeText(release.description, ""),

    archived: normalizeBoolean(release.archived),

    createdAt: normalizeText(release.createdAt, nowIso()),
    updatedAt: normalizeText(release.updatedAt, nowIso()),

    pcRequirements: {
      minimum: {
        cpu: normalizeText(
          release.pcRequirements?.minimum?.cpu ||
            release.minCpu ||
            "",
          ""
        ),

        gpu: normalizeText(
          release.pcRequirements?.minimum?.gpu ||
            release.minGpu ||
            "",
          ""
        ),

        ram: normalizeText(
          release.pcRequirements?.minimum?.ram ||
            release.minRam ||
            "",
          ""
        ),

        storage: normalizeText(
          release.pcRequirements?.minimum?.storage ||
            release.minStorage ||
            "",
          ""
        )
      },

      recommended: {
        cpu: normalizeText(
          release.pcRequirements?.recommended?.cpu ||
            release.recCpu ||
            "",
          ""
        ),

        gpu: normalizeText(
          release.pcRequirements?.recommended?.gpu ||
            release.recGpu ||
            "",
          ""
        ),

        ram: normalizeText(
          release.pcRequirements?.recommended?.ram ||
            release.recRam ||
            "",
          ""
        ),

        storage: normalizeText(
          release.pcRequirements?.recommended?.storage ||
            release.recStorage ||
            "",
          ""
        )
      }
    },

    votes: {
      pc: normalizeNumber(release.votes?.pc),
      playstation: normalizeNumber(release.votes?.playstation),
      xbox: normalizeNumber(release.votes?.xbox)
    }
  };
}

app.get("/api/releases", (req, res) => {
  let releases = readJson(RELEASES_FILE, []);

  if (!Array.isArray(releases)) {
    releases = [];
  }

  releases = releases
    .map(normalizeRelease)
    .filter((release) => !release.archived);

  releases.sort(
    (a, b) =>
      new Date(a.releaseDate).getTime() -
      new Date(b.releaseDate).getTime()
  );

  res.json(releases);
});

app.get("/api/releases/archive", requireAdmin, (req, res) => {
  let releases = readJson(RELEASES_FILE, []);

  if (!Array.isArray(releases)) {
    releases = [];
  }

  releases = releases.map(normalizeRelease);

  releases.sort(
    (a, b) =>
      new Date(b.releaseDate).getTime() -
      new Date(a.releaseDate).getTime()
  );

  res.json(releases);
});

app.post("/api/releases", requireAdmin, (req, res) => {
  const releases = readJson(RELEASES_FILE, []);

  const platforms = normalizePlatforms(
    req.body.platforms || req.body.platform
  );

  const release = normalizeRelease({
    id: createId("release_"),
    title: req.body.title,
    platforms,
    releaseDate: req.body.releaseDate || req.body.date,
    price: req.body.price,
    background:
      req.body.background ||
      req.body.image ||
      req.body.imageUrl,

    description: req.body.description,

    archived: false,

    pcRequirements: {
      minimum: {
        cpu: req.body.minCpu,
        gpu: req.body.minGpu,
        ram: req.body.minRam,
        storage: req.body.minStorage
      },

      recommended: {
        cpu: req.body.recCpu,
        gpu: req.body.recGpu,
        ram: req.body.recRam,
        storage: req.body.recStorage
      }
    },

    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  releases.push(release);

  writeJson(RELEASES_FILE, releases);
  syncWithGitHub();

  res.status(201).json({
    success: true,
    release
  });
});

app.patch("/api/releases/:id/archive", requireAdmin, (req, res) => {
  const releases = readJson(RELEASES_FILE, []);

  const index = releases.findIndex(
    (release) => String(release.id) === String(req.params.id)
  );

  if (index === -1) {
    return sendError(res, 404, "Релиз не найден");
  }

  const release = normalizeRelease(releases[index]);

  release.archived =
    req.body.archived !== undefined
      ? normalizeBoolean(req.body.archived)
      : true;

  release.updatedAt = nowIso();

  releases[index] = release;

  writeJson(RELEASES_FILE, releases);
  syncWithGitHub();

  res.json({
    success: true,
    release
  });
});

app.delete("/api/releases/:id", requireAdmin, (req, res) => {
  const releases = readJson(RELEASES_FILE, []);

  const index = releases.findIndex(
    (release) => String(release.id) === String(req.params.id)
  );

  if (index === -1) {
    return sendError(res, 404, "Релиз не найден");
  }

  const deleted = releases.splice(index, 1)[0];

  writeJson(RELEASES_FILE, releases);
  syncWithGitHub();

  res.json({
    success: true,
    deleted
  });
});

app.post("/api/releases/:id/vote", (req, res) => {
  const releases = readJson(RELEASES_FILE, []);

  const index = releases.findIndex(
    (release) => String(release.id) === String(req.params.id)
  );

  if (index === -1) {
    return sendError(res, 404, "Релиз не найден");
  }

  const release = normalizeRelease(releases[index]);

  const platform = normalizeText(
    req.body.platform || req.body.vote || req.body.type,
    ""
  ).toLowerCase();

  if (
    platform === "pc" ||
    platform === "playstation" ||
    platform === "xbox"
  ) {
    release.votes[platform] += 1;
  }

  releases[index] = release;

  writeJson(RELEASES_FILE, releases);

  res.json({
    success: true,
    votes: release.votes
  });
});

/* =========================================================
   MUSIC
   ========================================================= */

function normalizeMusicTrack(track) {
  if (typeof track === "string") {
    return {
      id: createId("music_"),
      title: "Трек",
      mp3Data: track
    };
  }

  if (!track || typeof track !== "object") {
    return null;
  }

  return {
    id: track.id || createId("music_"),
    title: normalizeText(track.title, "Без названия"),
    mp3Data: normalizeText(
      track.mp3Data || track.url || track.src,
      ""
    )
  };
}

function getMusicPlaylist() {
  const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

  if (!Array.isArray(config.musicPlaylist)) {
    return [];
  }

  return config.musicPlaylist
    .map(normalizeMusicTrack)
    .filter(Boolean);
}

app.get("/api/music", (req, res) => {
  res.json(getMusicPlaylist());
});

app.post("/api/music/manage", requireAdmin, (req, res) => {
  const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

  let playlist = req.body.musicPlaylist;

  if (!Array.isArray(playlist)) {
    playlist = config.musicPlaylist;
  }

  playlist = playlist
    .map(normalizeMusicTrack)
    .filter(Boolean);

  config.musicPlaylist = playlist;
  config.password = ADMIN_PASSWORD;

  writeJson(CONFIG_FILE, config);
  syncWithGitHub();

  res.status(200).json({
    success: true,
    musicPlaylist: playlist
  });
});

app.delete("/api/admin/music/:id", requireAdmin, (req, res) => {
  const config = readJson(CONFIG_FILE, DEFAULT_CONFIG);

  const playlist = Array.isArray(config.musicPlaylist)
    ? config.musicPlaylist
        .map(normalizeMusicTrack)
        .filter(Boolean)
    : [];

  const index = playlist.findIndex(
    (track) => String(track.id) === String(req.params.id)
  );

  if (index === -1) {
    return sendError(res, 404, "Трек не найден");
  }

  const deleted = playlist.splice(index, 1)[0];

  config.musicPlaylist = playlist;
  config.password = ADMIN_PASSWORD;

  writeJson(CONFIG_FILE, config);
  syncWithGitHub();

  res.json({
    success: true,
    deleted,
    musicPlaylist: playlist
  });
});

/* =========================================================
   QUIZ
   ========================================================= */

function normalizeQuiz(quiz) {
  const source =
    quiz && typeof quiz === "object"
      ? quiz
      : DEFAULT_QUIZ;

  return {
    question: normalizeText(
      source.question,
      DEFAULT_QUIZ.question
    ),

    image: normalizeText(source.image, ""),

    options: safeArray(source.options).map((option) => {
      if (
        option &&
        typeof option === "object" &&
        option.text !== undefined
      ) {
        return String(option.text);
      }

      return String(option);
    }),

    correctIndex: normalizeNumber(
      source.correctIndex,
      0
    )
  };
}

app.get("/api/quiz", (req, res) => {
  const quiz = normalizeQuiz(readJson(QUIZ_FILE, DEFAULT_QUIZ));

  res.json({
    question: quiz.question,
    image: quiz.image,
    options: quiz.options
  });
});

app.post("/api/quiz/manage", requireAdmin, (req, res) => {
  const quiz = normalizeQuiz({
    question: req.body.question,
    image: req.body.image,
    options: req.body.options,
    correctIndex:
      req.body.correctIndex !== undefined
        ? req.body.correctIndex
        : 0
  });

  if (quiz.options.length < 2) {
    return sendError(
      res,
      400,
      "В викторине должно быть минимум два варианта"
    );
  }

  if (
    quiz.correctIndex < 0 ||
    quiz.correctIndex >= quiz.options.length
  ) {
    return sendError(
      res,
      400,
      "Неверный индекс правильного ответа"
    );
  }

  writeJson(QUIZ_FILE, quiz);
  syncWithGitHub();

  res.json({
    success: true,
    quiz: {
      question: quiz.question,
      image: quiz.image,
      options: quiz.options
    }
  });
});

app.post("/api/quiz/answer", (req, res) => {
  const quiz = normalizeQuiz(readJson(QUIZ_FILE, DEFAULT_QUIZ));

  const answerIndex = normalizeNumber(
    req.body.answerIndex !== undefined
      ? req.body.answerIndex
      : req.body.index,
    -1
  );

  const correct = answerIndex === quiz.correctIndex;

  res.json({
    success: true,
    correct,
    correctIndex: quiz.correctIndex
  });
});

/* =========================================================
   POLL
   ========================================================= */

function normalizePoll(poll) {
  const source =
    poll && typeof poll === "object"
      ? poll
      : DEFAULT_POLL;

  const options = safeArray(source.options).map((option) => {
    if (
      option &&
      typeof option === "object" &&
      option.text !== undefined
    ) {
      return String(option.text);
    }

    return String(option);
  });

  let votes = safeArray(source.votes).map((vote) =>
    normalizeNumber(vote)
  );

  while (votes.length < options.length) {
    votes.push(0);
  }

  if (votes.length > options.length) {
    votes = votes.slice(0, options.length);
  }

  return {
    question: normalizeText(
      source.question,
      DEFAULT_POLL.question
    ),

    options,

    votes
  };
}

app.get("/api/poll", (req, res) => {
  const poll = normalizePoll(readJson(POLL_FILE, DEFAULT_POLL));

  const totalVotes = poll.votes.reduce(
    (sum, value) => sum + value,
    0
  );

  const percentages = poll.votes.map((vote) =>
    totalVotes > 0
      ? Math.round((vote / totalVotes) * 100)
      : 0
  );

  res.json({
    question: poll.question,
    options: poll.options,
    votes: poll.votes,
    percentages,
    totalVotes
  });
});

app.post("/api/poll/vote", (req, res) => {
  const poll = normalizePoll(readJson(POLL_FILE, DEFAULT_POLL));

  const optionIndex = normalizeNumber(
    req.body.optionIndex !== undefined
      ? req.body.optionIndex
      : req.body.index,
    -1
  );

  if (
    optionIndex < 0 ||
    optionIndex >= poll.options.length
  ) {
    return sendError(res, 400, "Неверный вариант ответа");
  }

  poll.votes[optionIndex] += 1;

  writeJson(POLL_FILE, poll);

  const totalVotes = poll.votes.reduce(
    (sum, value) => sum + value,
    0
  );

  const percentages = poll.votes.map((vote) =>
    totalVotes > 0
      ? Math.round((vote / totalVotes) * 100)
      : 0
  );

  res.json({
    success: true,
    question: poll.question,
    options: poll.options,
    votes: poll.votes,
    percentages,
    totalVotes
  });
});

app.post("/api/poll/manage", requireAdmin, (req, res) => {
  const current = normalizePoll(
    readJson(POLL_FILE, DEFAULT_POLL)
  );

  const options = safeArray(req.body.options)
    .map((option) => {
      if (
        option &&
        typeof option === "object" &&
        option.text !== undefined
      ) {
        return String(option.text).trim();
      }

      return String(option).trim();
    })
    .filter(Boolean);

  const resetVotes = normalizeBoolean(req.body.resetVotes);

  const poll = {
    question:
      typeof req.body.question === "string" &&
      req.body.question.trim()
        ? req.body.question.trim()
        : current.question,

    options:
      options.length > 0
        ? options
        : current.options,

    votes:
      resetVotes
        ? new Array(
            options.length > 0
              ? options.length
              : current.options.length
          ).fill(0)
        : current.votes
  };

  while (poll.votes.length < poll.options.length) {
    poll.votes.push(0);
  }

  if (poll.votes.length > poll.options.length) {
    poll.votes = poll.votes.slice(0, poll.options.length);
  }

  writeJson(POLL_FILE, poll);
  syncWithGitHub();

  res.json({
    success: true,
    poll
  });
});

/* =========================================================
   CLEAR DATABASE
   ========================================================= */

app.post("/api/admin/clear-all", requireAdmin, (req, res) => {
  writeJson(POSTS_FILE, []);
  writeJson(RELEASES_FILE, []);

  writeJson(CONFIG_FILE, {
    ...DEFAULT_CONFIG,
    password: ADMIN_PASSWORD,
    siteName: "PlayPC",
    musicPlaylist: [],
    footerText: DEFAULT_FOOTER_TEXT
  });

  writeJson(QUIZ_FILE, DEFAULT_QUIZ);
  writeJson(POLL_FILE, DEFAULT_POLL);

  syncWithGitHub();

  res.json({
    success: true,
    message: "База PlayPC очищена"
  });
});

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "PlayPC",
    time: nowIso()
  });
});

/* =========================================================
   SPA FALLBACK
   ========================================================= */

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.includes(".")
  ) {
    return next();
  }

  const indexPath = path.join(PUBLIC_DIR, "index.html");

  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res.status(404).send("PlayPC index.html not found");
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
    error: "Внутренняя ошибка сервера"
  });
});

/* =========================================================
   START
   ========================================================= */

app.listen(PORT, () => {
  console.log("======================================");
  console.log("PlayPC server started");
  console.log(`Port: ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log("Admin authentication: enabled");
  console.log("GitHub synchronization: enabled");
  console.log("======================================");
});