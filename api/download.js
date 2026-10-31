// Vercel Serverless Function — place this file at /api/download.js
// Cobalt API v11 compatible. No user cookies or login credentials are used.

const COBALT_INSTANCE = (process.env.COBALT_INSTANCE || "https://cobalt-latest-33pl.onrender.com").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 50000;

const ALLOWED_HOSTS = [
  "youtube.com", "youtu.be", "youtube-nocookie.com",
  "instagram.com",
  "facebook.com", "fb.watch",
  "snapchat.com"
];

const AUDIO_FORMATS = new Set(["best", "mp3", "ogg", "wav", "opus"]);
const VIDEO_QUALITIES = new Set(["144", "240", "360", "480", "720", "1080", "1440", "2160", "4320", "max"]);
const VIDEO_CONTAINERS = new Set(["mp4", "webm"]);

function json(res, status, body) {
  return res.status(status).json(body);
}

function isAllowedUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return ALLOWED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isImageFile(value) {
  if (!value || typeof value !== "string") return false;
  const clean = value.split("?")[0].split("#")[0].toLowerCase();
  return /\.(jpe?g|png|webp|avif|gif|bmp|heic)$/.test(clean);
}

function safeFilename(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || fallback;
}

function friendlyCobaltError(data, httpStatus) {
  const code = data && data.error && data.error.code ? String(data.error.code) : "";
  const messages = {
    "youtube.youtube_video_not_available": "YouTube ने यह वीडियो उपलब्ध नहीं कराया। वीडियो private, region-restricted या हटाया हुआ हो सकता है।",
    "youtube.youtube_age_restricted": "यह YouTube वीडियो age-restricted है और इस सेवा से प्रोसेस नहीं हो पाया।",
    "youtube.youtube_login_required": "YouTube इस लिंक के लिए sign-in मांग रहा है। इस downloader में personal login cookies इस्तेमाल नहीं किए जाते।",
    "youtube.youtube_content_is_unavailable": "YouTube content अभी उपलब्ध नहीं है। बाद में दोबारा कोशिश करें।",
    "instagram.login_required": "Instagram ने इस पोस्ट के लिए sign-in मांगा। Private/login-only content उपलब्ध नहीं कराया जा सकता।",
    "instagram.post_unavailable": "Instagram पोस्ट उपलब्ध नहीं है। यह हटाई गई, private या अस्थायी रूप से inaccessible हो सकती है।",
    "tiktok.no_video": "इस लिंक में डाउनलोड करने योग्य वीडियो नहीं मिला।",
    "rate_limit": "डाउनलोड सेवा पर अभी बहुत requests हैं। कुछ देर बाद कोशिश करें।",
    "error.api.rate_limit": "डाउनलोड सेवा पर अभी बहुत requests हैं। कुछ देर बाद कोशिश करें。"
  };
  if (messages[code]) return messages[code];
  if (httpStatus === 429) return "बहुत ज्यादा requests आ रही हैं। कृपया थोड़ी देर बाद कोशिश करें।";
  if (httpStatus === 503 || httpStatus === 502) return "डाउनलोड सर्वर अभी व्यस्त या अस्थायी रूप से अनुपलब्ध है। एक मिनट बाद कोशिश करें।";
  if (code) return `डाउनलोड सेवा ने अनुरोध स्वीकार नहीं किया (${code})। दूसरा public link आज़माएँ।`;
  return "यह लिंक अभी प्रोसेस नहीं हो पाया। सुनिश्चित करें कि पोस्ट public है और सही platform का link है।";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { status: "error", text: "Method not allowed. Use POST." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { url, type = "video", format = "mp3", quality = "1080" } = body;

  if (typeof url !== "string" || !url.trim()) {
    return json(res, 400, { status: "error", text: "कृपया media link डालें।" });
  }
  if (!isAllowedUrl(url.trim())) {
    return json(res, 400, {
      status: "error",
      text: "अभी YouTube, Instagram, Facebook और Snapchat के valid public links ही supported हैं।"
    });
  }
  if (!["video", "audio", "thumbnail"].includes(type)) {
    return json(res, 400, { status: "error", text: "Invalid download type." });
  }

  // YouTube thumbnail lookup (no third-party API required).
  if (type === "thumbnail") {
    try {
      const parsed = new URL(url.trim());
      let videoId = parsed.searchParams.get("v");
      if (!videoId && parsed.hostname.toLowerCase().endsWith("youtu.be")) {
        videoId = parsed.pathname.split("/").filter(Boolean)[0];
      }
      if (!videoId && parsed.pathname.includes("/shorts/")) videoId = parsed.pathname.split("/shorts/")[1].split("/")[0];
      if (!videoId && parsed.pathname.includes("/embed/")) videoId = parsed.pathname.split("/embed/")[1].split("/")[0];
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return json(res, 400, { status: "error", text: "Thumbnail download फिलहाल केवल valid YouTube video links के लिए है।" });
      }
      return json(res, 200, {
        status: "success",
        url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        filename: `youtube-thumbnail-${videoId}.jpg`
      });
    } catch {
      return json(res, 400, { status: "error", text: "YouTube link सही नहीं है।" });
    }
  }

  const cobaltBody = {
    url: url.trim(),
    downloadMode: type === "audio" ? "audio" : "auto",
    filenameStyle: "pretty",
    // Keep processing on the Cobalt server; avoid an unsupported client-side processing response.
    localProcessing: "disabled"
  };

  if (type === "audio") {
    cobaltBody.audioFormat = AUDIO_FORMATS.has(format) ? format : "mp3";
  } else {
    cobaltBody.videoQuality = VIDEO_QUALITIES.has(String(quality)) ? String(quality) : "1080";
    cobaltBody.youtubeVideoCodec = "h264"; // Broad phone compatibility.
    try {
      const host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
      if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
        cobaltBody.youtubeVideoContainer = VIDEO_CONTAINERS.has(format) ? format : "mp4";
      }
    } catch { /* URL was already validated above. */ }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const cobaltResponse = await fetch(`${COBALT_INSTANCE}/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cobaltBody),
      signal: controller.signal
    });

    const raw = await cobaltResponse.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error("Cobalt returned a non-JSON response:", cobaltResponse.status, raw.slice(0, 300));
      return json(res, 502, { status: "error", text: "डाउनलोड सर्वर से सही response नहीं मिला। थोड़ी देर बाद कोशिश करें।" });
    }

    if (!cobaltResponse.ok || data.status === "error") {
      return json(res, cobaltResponse.status >= 400 ? cobaltResponse.status : 422, {
        status: "error",
        text: friendlyCobaltError(data, cobaltResponse.status),
        code: data.error && data.error.code ? data.error.code : undefined
      });
    }

    // Instagram carousel / multi-media posts: select the first actual video, never its cover photo.
    if (data.status === "picker") {
      const items = Array.isArray(data.picker) ? data.picker : [];
      const chosen = type === "video"
        ? items.find((item) => item && item.type === "video" && typeof item.url === "string")
        : null;

      if (!chosen) {
        return json(res, 422, {
          status: "error",
          text: type === "video"
            ? "इस पोस्ट में कोई downloadable video नहीं मिला। इसमें केवल photos हो सकती हैं।"
            : "इस पोस्ट में चुने गए format के लिए media नहीं मिला।"
        });
      }

      if (!/^https?:\/\//i.test(chosen.url) || isImageFile(chosen.filename) || isImageFile(chosen.url)) {
        return json(res, 422, { status: "error", text: "Platform ने video के बजाय image लौटाई। कोई दूसरा public video link आज़माएँ।" });
      }

      return json(res, 200, {
        status: "success",
        url: chosen.url,
        filename: safeFilename(chosen.filename, "video.mp4"),
        mediaType: "video"
      });
    }

    if (data.status === "local-processing") {
      return json(res, 502, {
        status: "error",
        text: "यह media इस server की processing सीमा से compatible नहीं है। दूसरा link या कम quality चुनकर कोशिश करें।"
      });
    }

    if (data.status === "tunnel" || data.status === "redirect") {
      if (typeof data.url !== "string" || !/^https?:\/\//i.test(data.url)) {
        return json(res, 502, { status: "error", text: "डाउनलोड सर्वर ने valid file link नहीं दिया।" });
      }
      if (type === "video" && (isImageFile(data.filename) || isImageFile(data.url))) {
        return json(res, 422, { status: "error", text: "यह link video के बजाय image की ओर जा रहा है। सही video link डालें।" });
      }
      return json(res, 200, {
        status: data.status,
        url: data.url,
        filename: safeFilename(data.filename, type === "audio" ? "audio.mp3" : "video.mp4"),
        mediaType: type
      });
    }

    return json(res, 502, { status: "error", text: "डाउनलोड सेवा से unexpected response मिला। थोड़ी देर बाद कोशिश करें।" });
  } catch (error) {
    if (error && error.name === "AbortError") {
      return json(res, 504, { status: "error", text: "Server response में ज्यादा समय लग रहा है। एक मिनट बाद दोबारा कोशिश करें।" });
    }
    console.error("Cobalt request failed:", error);
    return json(res, 502, { status: "error", text: "डाउनलोड सर्वर से connection नहीं बन पाया। सर्वर जाग रहा हो सकता है; एक मिनट बाद retry करें।" });
  } finally {
    clearTimeout(timeout);
  }
};
    
