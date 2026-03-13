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
const allowedOrigins = String(process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function getSubOrDub(value) {
  return String(value || "sub").toLowerCase() === "dub"
    ? SubOrSub.DUB
    : SubOrSub.SUB;
}

function getPublicOrigin(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/$/, "");
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function buildProxyUrl(req, url, referer) {
  const params = new URLSearchParams({ url });

  if (referer) {
    params.set("referer", referer);
  }

  return `${getPublicOrigin(req)}/anime/gogoanime/proxy-stream?${params.toString()}`;
}

function rewritePlaylist(req, content, playlistUrl, referer) {
  return content
    .split("\n")
    .map((line) => {
      if (!line.trim()) {
        return line;
      }

      if (line.startsWith("#EXT-X-KEY") && line.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/, (_match, uri) => {
          const absoluteUrl = new URL(uri, playlistUrl).toString();
          return `URI="${buildProxyUrl(req, absoluteUrl, referer)}"`;
        });
      }

      if (line.startsWith("#")) {
        return line;
      }

      const absoluteUrl = new URL(line, playlistUrl).toString();
      return buildProxyUrl(req, absoluteUrl, referer);
    })
    .join("\n");
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
    res.status(502).json({ message: "info failed", error: String(error) });
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
    res.status(502).json({ message: "servers failed", error: String(error) });
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
    res.json({
      ...data,
      sources: (data.sources || []).map((source, index) => ({
        ...source,
        url: referer ? buildProxyUrl(req, source.url, referer) : source.url,
        quality:
          source.quality ||
          (source.isM3U8 ? "auto" : `source-${String(index + 1)}`),
      })),
    });
  } catch (error) {
    res.status(502).json({ message: "watch failed", error: String(error) });
  }
});

app.get("/anime/gogoanime/proxy-stream", async (req, res) => {
  const url = String(req.query.url || "");
  const referer = String(req.query.referer || "");

  if (!url) {
    res.status(400).json({ message: "url is required" });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: referer ? { Referer: referer } : {},
    });

    if (!response.ok) {
      res.status(response.status).send(await response.text());
      return;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("mpegurl") || url.includes(".m3u8")) {
      const playlist = await response.text();
      res.type("application/vnd.apple.mpegurl");
      res.send(rewritePlaylist(req, playlist, url, referer));
      return;
    }

    const body = Buffer.from(await response.arrayBuffer());
    if (contentType) {
      res.setHeader("content-type", contentType);
    }
    res.send(body);
  } catch (error) {
    res.status(502).json({ message: "proxy failed", error: String(error) });
  }
});

app.get("/anime/gogoanime/:query", async (req, res) => {
  try {
    const data = await animeProvider.search(req.params.query);
    res.json(data);
  } catch (error) {
    res.status(502).json({ message: "search failed", error: String(error) });
  }
});

app.listen(port, host, () => {
  console.log(`Kaido Consumet API listening on http://${host}:${port}`);
});
