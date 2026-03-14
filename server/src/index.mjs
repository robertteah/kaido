import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ANIME, SubOrSub } from "@consumet/extensions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");

for (const envPath of [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(serverRoot, ".env"),
  path.join(serverRoot, ".env.local"),
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const animeProvider = new ANIME.AnimeKai();
const browserUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const allowedOrigins = String(process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function getSubOrDub(value) {
  return String(value || "sub").toLowerCase() === "dub"
    ? SubOrSub.DUB
    : SubOrSub.SUB;
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getPublicOrigin(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/$/, "");
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function buildProxyUrl(req, url, referer, origin) {
  const params = new URLSearchParams({ url });

  if (referer) {
    params.set("referer", referer);
  }

  if (origin) {
    params.set("origin", origin);
  }

  return `${getPublicOrigin(req)}/anime/gogoanime/proxy-stream?${params.toString()}`;
}

function rewritePlaylist(req, content, playlistUrl, referer, origin) {
  return content
    .split("\n")
    .map((line) => {
      if (!line.trim()) {
        return line;
      }

      if (line.startsWith("#EXT-X-KEY") && line.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/, (_match, uri) => {
          const absoluteUrl = new URL(uri, playlistUrl).toString();
          return `URI="${buildProxyUrl(req, absoluteUrl, referer, origin)}"`;
        });
      }

      if (line.startsWith("#")) {
        return line;
      }

      const absoluteUrl = new URL(line, playlistUrl).toString();
      return buildProxyUrl(req, absoluteUrl, referer, origin);
    })
    .join("\n");
}

function createRequestHeaders(headers = {}) {
  return {
    "user-agent": browserUserAgent,
    accept: "*/*",
    ...headers,
  };
}

function buildRapidCloudStreamHeaders(embedUrl) {
  const origin = new URL(embedUrl).origin;
  return {
    Origin: origin,
    Referer: `${origin}/`,
  };
}

async function fetchJson(url, headers) {
  const response = await fetch(url, {
    headers: createRequestHeaders(headers),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchText(url, headers) {
  const response = await fetch(url, {
    headers: createRequestHeaders(headers),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} for ${url}`);
  }

  return response.text();
}

function decodeEscapedContent(value) {
  return String(value || "")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
}

function extractM3u8Url(content) {
  const decoded = decodeEscapedContent(content);
  const patterns = [
    /https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/gi,
    /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
    /sources?\s*["']?\s*:\s*\[[\s\S]*?["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(decoded);
    if (!match) {
      continue;
    }

    const candidate = match[1] || match[0];
    return candidate.replace(/^file\s*:\s*["']/, "").replace(/["']$/, "");
  }

  return null;
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, "").trim());
}

function normalizeKaidoPath(pathname) {
  return String(pathname || "")
    .replace(/^\/+/, "")
    .replace(/\?.*$/, "")
    .trim();
}

function parseKaidoSearchResults(html) {
  const matches = [
    ...String(html || "").matchAll(
      /<div class="flw-item">[\s\S]*?<img[^>]*data-src="([^"]+)"[\s\S]*?<a href="([^"]+)"[^>]*title="([^"]+)"[^>]*data-id="(\d+)"[\s\S]*?<h3 class="film-name"><a [^>]*data-jname="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
    ),
  ];

  return matches.map((match) => {
    const block = match[0];
    const subMatch = block.match(/tick-sub[^>]*><i[\s\S]*?<\/i>(\d+)/);
    const dubMatch = block.match(/tick-dub[^>]*><i[\s\S]*?<\/i>(\d+)/);

    return {
      id: normalizeKaidoPath(match[2]),
      title: stripHtml(match[6] || match[3]),
      japaneseTitle: decodeHtmlEntities(match[5] || ""),
      title_english: stripHtml(match[6] || match[3]),
      title_romaji: decodeHtmlEntities(match[5] || ""),
      image: match[1],
      sub: Number(subMatch?.[1] || 0),
      dub: Number(dubMatch?.[1] || 0),
    };
  });
}

function parseKaidoServers(html) {
  const matches = [
    ...String(html || "").matchAll(
      /<div class="item server-item"[^>]*data-type="([^"]+)"[^>]*data-id="([^"]+)"[^>]*data-server-id="([^"]+)"[^>]*>\s*<a [^>]*class="btn">([^<]+)<\/a>/g
    ),
  ];

  return matches.map((match) => ({
    type: match[1],
    id: match[2],
    serverId: Number(match[3]),
    name: stripHtml(match[4]),
  }));
}

async function fetchKaidoServers(episodeId) {
  const url = `https://kaido.to/ajax/episode/servers?episodeId=${encodeURIComponent(
    episodeId
  )}`;
  const payload = await fetchJson(url, {
    Referer: `https://kaido.to/watch/?ep=${episodeId}`,
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json, text/plain, */*",
  });

  if (!payload?.status || !payload?.html) {
    throw new Error("Kaido server response did not include server HTML");
  }

  const servers = parseKaidoServers(payload.html);
  if (!servers.length) {
    throw new Error("No Kaido servers were found for this episode");
  }

  return servers;
}

async function searchKaido(query) {
  const url = `https://kaido.to/search?keyword=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  return {
    currentPage: 1,
    hasNextPage: false,
    results: parseKaidoSearchResults(html),
  };
}

function parseKaidoEpisodes(html) {
  const matches = [
    ...String(html || "").matchAll(
      /<a[^>]*class="[^"]*\bep-item\b[^"]*"[^>]*data-number="(\d+)"[^>]*data-id="(\d+)"[^>]*href="([^"]+)"[\s\S]*?<div class="ep-name[^"]*"[^>]*data-jname="([^"]*)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/div>/g
    ),
  ];

  return matches.map((match) => ({
    id: match[2],
    number: Number(match[1]),
    title: stripHtml(match[6] || match[5]),
    japaneseTitle: decodeHtmlEntities(match[4] || ""),
    url: match[3].startsWith("http") ? match[3] : `https://kaido.to${match[3]}`,
  }));
}

function extractKaidoInfoField(html, label) {
  const pattern = new RegExp(
    `<span class="item-head">${label}:<\\/span>\\s*<span class="name">([\\s\\S]*?)<\\/span>`,
    "i"
  );
  return stripHtml(html.match(pattern)?.[1] || "");
}

async function fetchKaidoInfo(id) {
  const slugId = normalizeKaidoPath(id);
  const animeId = slugId.match(/-(\d+)$/)?.[1];
  const watchUrl = `https://kaido.to/watch/${slugId}`;
  const response = await fetch(watchUrl, {
    headers: createRequestHeaders(),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} for ${watchUrl}`);
  }

  const html = await response.text();
  const titleMatch = html.match(
    /<h2 class="film-name">[\s\S]*?<a [^>]*data-jname="([^"]*)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i
  );
  const title = stripHtml(titleMatch?.[3] || titleMatch?.[2] || "") || slugId;
  const japaneseTitle = decodeHtmlEntities(titleMatch?.[1] || "");
  const description = stripHtml(
    html.match(/<div class="film-description[^"]*">\s*<div class="text">([\s\S]*?)<\/div>/i)?.[1]
  );
  const image =
    html.match(/<img[^>]*class="film-poster-img"[^>]*src="([^"]+)"/i)?.[1] ||
    html.match(/<img[^>]*src="([^"]+)"[^>]*alt="[^"]*"/i)?.[1] ||
    "";
  let episodes = [];

  if (animeId) {
    try {
      const episodeListPayload = await fetchJson(
        `https://kaido.to/ajax/episode/list/${animeId}`,
        {
          Referer: watchUrl,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/plain, */*",
        }
      );
      if (episodeListPayload?.status && episodeListPayload?.html) {
        episodes = parseKaidoEpisodes(episodeListPayload.html);
      }
    } catch (error) {
      console.error("Kaido episode list fallback failed", {
        id: slugId,
        details: serializeError(error),
      });
    }
  }

  return {
    id: slugId,
    title,
    japaneseTitle,
    description,
    image,
    episodes,
  };
}

async function extractKaidoStream(sourceId) {
  const ajaxUrl = `https://kaido.to/ajax/episode/sources?id=${encodeURIComponent(
    sourceId
  )}`;
  const sourcePayload = await fetchJson(ajaxUrl, {
    Referer: "https://kaido.to/",
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json, text/plain, */*",
  });

  if (!sourcePayload?.link) {
    throw new Error("Kaido source response did not include an embed link");
  }

  const embedUrl = sourcePayload.link;
  const streamHeaders = buildRapidCloudStreamHeaders(embedUrl);
  const embedHtml = await fetchText(embedUrl, {
    Referer: "https://kaido.to/",
  });

  if (/file not found|we can't find the file/i.test(embedHtml)) {
    throw new Error("Rapid-cloud embed returned a file-not-found page");
  }

  const embedId =
    embedUrl.match(/\/e-1\/([^?/#]+)/)?.[1] ||
    embedHtml.match(/id="vidcloud-player"[^>]*data-id="([^"]+)"/i)?.[1];

  if (!embedId) {
    throw new Error("Failed to determine the rapid-cloud embed ID");
  }

  const sourcesPayload = await fetchJson(
    `https://rapid-cloud.co/embed-2/v2/e-1/getSources?id=${encodeURIComponent(
      embedId
    )}`,
    {
      ...streamHeaders,
      Referer: `${new URL(embedUrl).origin}/`,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/plain, */*",
    }
  );
  const streamUrl =
    sourcesPayload?.sources?.find((source) => source?.file)?.file ||
    sourcesPayload?.sources?.find((source) => source?.url)?.url ||
    extractM3u8Url(JSON.stringify(sourcesPayload));

  if (!streamUrl) {
    throw new Error("Failed to locate an m3u8 URL in rapid-cloud getSources");
  }

  return {
    sourceId,
    sourcePayload,
    embedUrl,
    streamUrl,
    headers: streamHeaders,
    tracks: sourcesPayload?.tracks || [],
    intro: sourcesPayload?.intro || null,
    outro: sourcesPayload?.outro || null,
  };
}

async function extractKaidoEpisodeStream(episodeId, preferredType) {
  const servers = await fetchKaidoServers(episodeId);
  const normalizedType = String(preferredType || "").toLowerCase();
  const orderedServers = [
    ...servers.filter((server) => server.type === normalizedType),
    ...servers.filter((server) => server.type !== normalizedType),
  ];

  const failures = [];

  for (const server of orderedServers) {
    try {
      const extracted = await extractKaidoStream(server.id);
      return {
        episodeId,
        server,
        ...extracted,
      };
    } catch (error) {
      failures.push({
        server,
        details: serializeError(error),
      });
    }
  }

  const error = new Error("All Kaido servers failed for this episode");
  error.failures = failures;
  throw error;
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/anime/gogoanime/info/:id", async (req, res) => {
  try {
    const data = await animeProvider.fetchAnimeInfo(req.params.id);
    res.json(data);
  } catch (error) {
    try {
      const data = await fetchKaidoInfo(req.params.id);
      res.json(data);
    } catch (fallbackError) {
      const details = serializeError(error);
      const fallbackDetails = serializeError(fallbackError);
      console.error("Consumet info failed", {
        id: req.params.id,
        details,
        fallbackDetails,
      });
      res.status(502).json({ message: "info failed", details, fallbackDetails });
    }
  }
});

app.get("/anime/gogoanime/servers/:episodeId", async (req, res) => {
  try {
    const subOrDub = getSubOrDub(req.query.subOrDub);
    const data = await animeProvider.fetchEpisodeServers(
      req.params.episodeId,
      subOrDub
    );
    res.json(
      data.map((server) => ({
        ...server,
        id: server.name,
      }))
    );
  } catch (error) {
    const details = serializeError(error);
    console.error("Consumet servers failed", {
      episodeId: req.params.episodeId,
      subOrDub: req.query.subOrDub,
      details,
    });
    res.status(502).json({ message: "servers failed", details });
  }
});

app.get("/anime/gogoanime/watch/:episodeId", async (req, res) => {
  try {
    const subOrDub = getSubOrDub(req.query.subOrDub);
    const data = await animeProvider.fetchEpisodeSources(
        req.params.episodeId,
        req.query.server,
        subOrDub
    );
    const referer = data.headers?.Referer || data.headers?.referer;
    const origin = data.headers?.Origin || data.headers?.origin;
    res.json({
      ...data,
      sources: (data.sources || []).map((source, index) => ({
        ...source,
        url:
          referer || origin
            ? buildProxyUrl(req, source.url, referer, origin)
            : source.url,
        quality:
          source.quality ||
          (source.isM3U8 ? "auto" : `source-${String(index + 1)}`),
      })),
    });
  } catch (error) {
    const details = serializeError(error);
    console.error("Consumet watch failed", {
      episodeId: req.params.episodeId,
      server: req.query.server,
      subOrDub: req.query.subOrDub,
      details,
    });
    res.status(502).json({ message: "watch failed", details });
  }
});

app.get("/anime/gogoanime/proxy-stream", async (req, res) => {
  const url = String(req.query.url || "");
  const referer = String(req.query.referer || "");
  const origin = String(req.query.origin || "");

  if (!url) {
    res.status(400).json({ message: "url is required" });
    return;
  }

  try {
    const headers = {};
    if (referer) {
      headers.Referer = referer;
    }
    if (origin) {
      headers.Origin = origin;
    }

    const response = await fetch(url, {
      headers: createRequestHeaders(headers),
    });

    if (!response.ok) {
      res.status(response.status).send(await response.text());
      return;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("mpegurl") || url.includes(".m3u8")) {
      const playlist = await response.text();
      res.type("application/vnd.apple.mpegurl");
      res.send(rewritePlaylist(req, playlist, url, referer, origin));
      return;
    }

    const body = Buffer.from(await response.arrayBuffer());
    if (contentType) {
      res.setHeader("content-type", contentType);
    }
    res.send(body);
  } catch (error) {
    const details = serializeError(error);
    console.error("Consumet proxy failed", {
      url,
      details,
    });
    res.status(502).json({ message: "proxy failed", details });
  }
});

app.get("/anime/kaido/watch/:sourceId", async (req, res) => {
  try {
    const extracted = await extractKaidoStream(req.params.sourceId);
    const shouldProxy = String(req.query.proxy || "true").toLowerCase() !== "false";
    const proxiedUrl = shouldProxy
      ? buildProxyUrl(
          req,
          extracted.streamUrl,
          extracted.headers.Referer,
          extracted.headers.Origin
        )
      : extracted.streamUrl;

    res.json({
      sourceId: extracted.sourceId,
      server: extracted.sourcePayload?.server ?? null,
      type: extracted.sourcePayload?.type ?? null,
      embed: extracted.embedUrl,
      headers: extracted.headers,
      sources: [
        {
          url: proxiedUrl,
          quality: "auto",
          isM3U8: true,
        },
      ],
    });
  } catch (error) {
    const details = serializeError(error);
    console.error("Kaido extractor failed", {
      sourceId: req.params.sourceId,
      details,
    });
    res.status(502).json({ message: "kaido extractor failed", details });
  }
});

app.get("/anime/kaido/servers/:episodeId", async (req, res) => {
  try {
    const servers = await fetchKaidoServers(req.params.episodeId);
    res.json({
      episodeId: req.params.episodeId,
      servers,
    });
  } catch (error) {
    const details = serializeError(error);
    console.error("Kaido servers failed", {
      episodeId: req.params.episodeId,
      details,
    });
    res.status(502).json({ message: "kaido servers failed", details });
  }
});

app.get("/anime/kaido/watch-by-episode/:episodeId", async (req, res) => {
  try {
    const extracted = await extractKaidoEpisodeStream(
      req.params.episodeId,
      req.query.type
    );
    const shouldProxy = String(req.query.proxy || "true").toLowerCase() !== "false";
    const proxiedUrl = shouldProxy
      ? buildProxyUrl(
          req,
          extracted.streamUrl,
          extracted.headers.Referer,
          extracted.headers.Origin
        )
      : extracted.streamUrl;

    res.json({
      episodeId: extracted.episodeId,
      sourceId: extracted.sourceId,
      server: extracted.server,
      embed: extracted.embedUrl,
      headers: extracted.headers,
      sources: [
        {
          url: proxiedUrl,
          quality: "auto",
          isM3U8: true,
        },
      ],
    });
  } catch (error) {
    const details = serializeError(error);
    console.error("Kaido episode extractor failed", {
      episodeId: req.params.episodeId,
      type: req.query.type,
      details,
      failures: error?.failures,
    });
    res.status(502).json({
      message: "kaido episode extractor failed",
      details,
      failures: error?.failures || [],
    });
  }
});

app.get("/anime/gogoanime/:query", async (req, res) => {
  try {
    const data = await animeProvider.search(req.params.query);
    res.json(data);
  } catch (error) {
    try {
      const data = await searchKaido(req.params.query);
      res.json(data);
    } catch (fallbackError) {
      const details = serializeError(error);
      const fallbackDetails = serializeError(fallbackError);
      console.error("Consumet search failed", {
        query: req.params.query,
        details,
        fallbackDetails,
      });
      res.status(502).json({ message: "search failed", details, fallbackDetails });
    }
  }
});

app.listen(port, host, () => {
  console.log(`Kaido Consumet API listening on http://${host}:${port}`);
});
