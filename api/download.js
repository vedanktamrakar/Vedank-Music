// Vercel Serverless Function: /api/download.js
const COBALT = (process.env.COBALT_INSTANCE || "https://cobalt-latest-33pl.onrender.com").replace(/\/+$/, "");

const HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com", "instagram.com", "facebook.com", "fb.watch", "snapchat.com"];
const AUDIO = new Set(["best", "mp3", "ogg", "wav", "opus"]);
const QUALITY = new Set(["144", "240", "360", "480", "720", "1080", "1440", "2160", "4320", "max"]);
const IMG = /\.(jpe?g|png|webp|avif|gif|bmp|heic)$/;

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

function isImage(v) {
  return typeof v === "string" && IMG.test(v.split("?")[0].split("#")[0].toLowerCase());
}

function safeName(v, fallback) {
  if (typeof v !== "string" || !v.trim()) return fallback;
  return v.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || fallback;
}

function friendly(data, status) {
  const code = data && data.error && data.error.code ? String(data.error.code) : "";
  if (code.includes("login")) return "Platform sign-in maang raha hai. Koi dusra public link try karo ya thodi der baad.";
  if (code.includes("not_available") || code.includes("unavailable")) return "Yeh video available nahi hai (private, hata hua ya region-locked).";
  if (code.includes("age")) return "Yeh video age-restricted hai.";
  if (status === 429 || code.includes("rate")) return "Abhi bahut requests hain. Thodi der baad try karo.";
  if (status === 502 || status === 503) return "Download server busy hai. Ek minute baad try karo.";
  return code ? "Download nahi ho paya (" + code + "). Dusra public link try karo." : "Link process nahi hua. Check karo ki post public hai.";
}

// Render sleep se jaage to ek baar dobara try karta hai
async function askCobalt(body) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 28000);
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { status: "error", text: "Sirf POST allowed hai." });
  }

  const b = req.body && typeof req.body === "object" ? req.body : {};
  const url = typeof b.url === "string" ? b.url.trim() : "";
  const type = b.type || "video";
  const format = b.format || "mp4";
  const quality = String(b.quality || "1080");

  if (!url) return send(res, 400, { status: "error", text: "Pehle link daalo." });
  if (!allowed(url)) return send(res, 400, { status: "error", text: "Sirf YouTube, Instagram, Facebook aur Snapchat ke public links chalenge." });
  if (!["video", "audio", "thumbnail"].includes(type)) return send(res, 400, { status: "error", text: "Galat type." });

  // YouTube thumbnail
  if (type === "thumbnail") {
    const u = new URL(url);
    let id = u.searchParams.get("v");
    if (!id && u.hostname.toLowerCase().endsWith("youtu.be")) id = u.pathname.split("/").filter(Boolean)[0];
    if (!id && u.pathname.includes("/shorts/")) id = u.pathname.split("/shorts/")[1].split("/")[0];
    if (!id && u.pathname.includes("/embed/")) id = u.pathname.split("/embed/")[1].split("/")[0];
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return send(res, 400, { status: "error", text: "Thumbnail sirf YouTube links ke liye hai." });
    }
    return send(res, 200, {
      status: "success",
      url: "https://img.youtube.com/vi/" + id + "/maxresdefault.jpg",
      filename: "thumbnail-" + id + ".jpg"
    });
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
    return send(res, 502, { status: "error", text: "Download server se jawab nahi mila. Ek minute baad dobara try karo." });
  }
  if (result.status >= 400 || data.status === "error") {
    return send(res, result.status >= 400 ? result.status : 422, {
      status: "error",
      text: friendly(data, result.status),
      code: data.error && data.error.code ? data.error.code : undefined
    });
  }

  // Instagram carousel: pehla asli video lo
  if (data.status === "picker") {
    const items = Array.isArray(data.picker) ? data.picker : [];
    const pick = items.find((i) => i && i.type === "video" && typeof i.url === "string");
    if (type === "video" && pick && /^https?:\/\//i.test(pick.url) && !isImage(pick.url) && !isImage(pick.filename)) {
      return send(res, 200, { status: "success", url: pick.url, filename: safeName(pick.filename, "video.mp4"), mediaType: "video" });
    }
    if (type === "audio" && typeof data.audio === "string") {
      return send(res, 200, { status: "success", url: data.audio, filename: safeName(data.audioFilename, "audio.mp3"), mediaType: "audio" });
    }
    return send(res, 422, { status: "error", text: "Is post mein download hone wala video nahi mila." });
  }

  if (data.status === "tunnel" || data.status === "redirect") {
    if (typeof data.url !== "string" || !/^https?:\/\//i.test(data.url)) {
      return send(res, 502, { status: "error", text: "Server ne sahi file link nahi diya." });
    }
    if (type === "video" && (isImage(data.filename) || isImage(data.url))) {
      return send(res, 422, { status: "error", text: "Yeh link video nahi, image hai." });
    }
    return send(res, 200, {
      status: data.status,
      url: data.url,
      filename: safeName(data.filename, type === "audio" ? "audio.mp3" : "video.mp4"),
      mediaType: type
    });
  }

  return send(res, 502, { status: "error", text: "Unexpected jawab mila. Thodi der baad try karo." });
};
