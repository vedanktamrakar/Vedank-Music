// Vercel Serverless Function: /api/download.js
const { Readable } = require("stream");

const COBALT = (process.env.COBALT_INSTANCE || "https://cobalt-latest-33pl.onrender.com").replace(/\/+$/, "");

const HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com", "instagram.com", "facebook.com", "fb.watch", "snapchat.com"];
const AUDIO = new Set(["best", "mp3", "ogg", "wav", "opus"]);
const QUALITY = new Set(["144", "240", "360", "480", "720", "1080", "1440", "2160", "4320", "max"]);
const IMG = /\.(jpe?g|png|webp|avif|gif|bmp|heic)$/;
const PROXY_SUFFIXES = ["cdninstagram.com", "fbcdn.net", "googlevideo.com", "ytimg.com"];

const send = (res, code, body) => res.status(code).json(body);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hostOf(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

function allowed(value) {
  const h = hostOf(value);
  return !!h && HOSTS.some((d) => h === d || h.endsWith("." + d));
}

function proxyable(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (value.startsWith(COBALT + "/")) return true;
    const h = u.hostname.toLowerCase();
    if (h === "img.youtube.com") return true;
    return PROXY_SUFFIXES.some((s) => h === s || h.endsWith("." + s));
  } catch { return false; }
}

function isImage(v) {
  return typeof v === "string" && IMG.test(v.split("?")[0].split("#")[0].toLowerCase());
}

function safeName(v, fallback) {
  if (typeof v !== "string" || !v.trim()) return fallback;
  return v.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || fallback;
}

function downloadLink(fileUrl, name) {
  if (!proxyable(fileUrl)) return fileUrl;
  return "/api/download?file=" + encodeURIComponent(fileUrl) + "&name=" + encodeURIComponent(name);
}

function friendly(data, status) {
  const code = data && data.error && data.error.code ? String(data.error.code) : "";
  if (code.includes("login")) return "The platform is asking for sign-in. Try another public link or try again later.";
  if (code.includes("not_available") || code.includes("unavailable")) return "This video is not available (private, removed or region-locked).";
  if (code.includes("age")) return "This video is age-restricted.";
  if (status === 429 || code.includes("rate")) return "Too many requests right now. Please try again in a moment.";
  if (status === 502 || status === 503) return "The download server is busy. Please try again in a minute.";
  return code ? "Could not download this link (" + code + "). Try another public link." : "Could not process this link. Make sure the post is public.";
}

// Retries once in case the Render server was asleep
async function askCobalt(body) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(COBALT + "/", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      const text = await r.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}
      if (data && r.status !== 502 && r.status !== 503) return { status: r.status, data };
      last = { status: r.status, data };
    } catch (e) {
      last = { status: 504, data: null };
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await sleep(3000);
  }
  return last;
}

// GET: streams the file to the browser as a real download
async function streamFile(req, res) {
  const file = typeof req.query.file === "string" ? req.query.file : "";
  const name = safeName(req.query.name, "download");

  if (!file || !proxyable(file)) {
    return send(res, 403, { status: "error", text: "This file link is not allowed." });
  }

  try {
    const up = await fetch(file, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
    if (!up.ok || !up.body) {
      return send(res, 502, { status: "error", text: "Could not fetch the file. Please try again." });
    }

    const ascii = name.replace(/[^\x20-\x7e]/g, "_");
    res.statusCode = 200;
    res.setHeader("Content-Type", up.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name));
    res.setHeader("Cache-Control", "no-store");
    const len = up.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);

    Readable.fromWeb(up.body).on("error", () => res.end()).pipe(res);
  } catch (e) {
    return send(res, 502, { status: "error", text: "Download failed. Please try again." });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") return streamFile(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { status: "error", text: "Method not allowed." });
  }

  const b = req.body && typeof req.body === "object" ? req.body : {};
  const url = typeof b.url === "string" ? b.url.trim() : "";
  const type = b.type || "video";
  const format = b.format || "mp4";
  const quality = String(b.quality || "1080");

  if (!url) return send(res, 400, { status: "error", text: "Please paste a link first." });
  if (!allowed(url)) return send(res, 400, { status: "error", text: "Only public YouTube, Instagram, Facebook and Snapchat links are supported." });
  if (!["video", "audio", "thumbnail"].includes(type)) return send(res, 400, { status: "error", text: "Invalid download type." });

  // YouTube thumbnail
  if (type === "thumbnail") {
    const u = new URL(url);
    let id = u.searchParams.get("v");
    if (!id && u.hostname.toLowerCase().endsWith("youtu.be")) id = u.pathname.split("/").filter(Boolean)[0];
    if (!id && u.pathname.includes("/shorts/")) id = u.pathname.split("/shorts/")[1].split("/")[0];
    if (!id && u.pathname.includes("/embed/")) id = u.pathname.split("/embed/")[1].split("/")[0];
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return send(res, 400, { status: "error", text: "Thumbnails work for YouTube links only." });
    }
    const imgUrl = "https://img.youtube.com/vi/" + id + "/maxresdefault.jpg";
    const imgName = "thumbnail-" + id + ".jpg";
    return send(res, 200, { status: "success", url: imgUrl, downloadUrl: downloadLink(imgUrl, imgName), filename: imgName });
  }

  const body = {
    url,
    downloadMode: type === "audio" ? "audio" : "auto",
    filenameStyle: "pretty",
    localProcessing: "disabled"
  };

  if (type === "audio") {
    body.audioFormat = AUDIO.has(format) ? format : "mp3";
  } else {
    body.videoQuality = QUALITY.has(quality) ? quality : "1080";
    body.youtubeVideoCodec = "h264";
    const h = hostOf(url) || "";
    if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be") {
      body.youtubeVideoContainer = format === "webm" ? "webm" : "mp4";
    }
  }

  const result = await askCobalt(body);
  const data = result && result.data;

  if (!data) {
    return send(res, 502, { status: "error", text: "No response from the download server. Please try again in a minute." });
  }
  if (result.status >= 400 || data.status === "error") {
    return send(res, result.status >= 400 ? result.status : 422, {
      status: "error",
      text: friendly(data, result.status),
      code: data.error && data.error.code ? data.error.code : undefined
    });
  }

  // Instagram carousel: pick the first real video
  if (data.status === "picker") {
    const items = Array.isArray(data.picker) ? data.picker : [];
    const pick = items.find((i) => i && i.type === "video" && typeof i.url === "string");
    if (type === "video" && pick && /^https?:\/\//i.test(pick.url) && !isImage(pick.url) && !isImage(pick.filename)) {
      const name = safeName(pick.filename, "video.mp4");
      return send(res, 200, { status: "success", url: pick.url, downloadUrl: downloadLink(pick.url, name), filename: name, mediaType: "video" });
    }
    if (type === "audio" && typeof data.audio === "string") {
      const name = safeName(data.audioFilename, "audio.mp3");
      return send(res, 200, { status: "success", url: data.audio, downloadUrl: downloadLink(data.audio, name), filename: name, mediaType: "audio" });
    }
    return send(res, 422, { status: "error", text: "No downloadable video was found in this post." });
  }

  if (data.status === "tunnel" || data.status === "redirect") {
    if (typeof data.url !== "string" || !/^https?:\/\//i.test(data.url)) {
      return send(res, 502, { status: "error", text: "The server did not return a valid file link." });
    }
    if (type === "video" && (isImage(data.filename) || isImage(data.url))) {
      return send(res, 422, { status: "error", text: "This link points to an image, not a video." });
    }
    const name = safeName(data.filename, type === "audio" ? "audio.mp3" : "video.mp4");
    return send(res, 200, {
      status: data.status,
      url: data.url,
      downloadUrl: downloadLink(data.url, name),
      filename: name,
      mediaType: type
    });
  }

  return send(res, 502, { status: "error", text: "Unexpected response. Please try again later." });
};
