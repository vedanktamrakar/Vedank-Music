// api/download.js — Vercel Serverless Function (Cobalt v11+ Compatible)

const COBALT_INSTANCE = "https://cobalt-latest-33pl.onrender.com";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", text: "Method not allowed" });
  }

  const { url, type, format, quality } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ status: "error", text: "URL is required" });
  }

  // ==========================================
  // 1. THUMBNAIL DOWNLOAD HANDLER (New Feature)
  // ==========================================
  if (type === "thumbnail") {
    try {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
      const match = url.match(regExp);
      
      if (match && match[2].length === 11) {
        const videoId = match[2];
        const thumbUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        return res.status(200).json({
          status: "success",
          url: thumbUrl,
          filename: `thumbnail_${videoId}.jpg`
        });
      } else {
        return res.status(400).json({
          status: "error",
          text: "फिलहाल थंबनेल डाउनलोड सिर्फ YouTube लिंक के लिए उपलब्ध है।"
        });
      }
    } catch (err) {
      return res.status(500).json({ status: "error", text: "Thumbnail process failed." });
    }
  }

  // ==========================================
  // 2. AUDIO / VIDEO DOWNLOAD HANDLER
  // ==========================================
  const cobaltBody = { url };

  if (type === "audio") {
    cobaltBody.downloadMode = "audio";
    cobaltBody.audioFormat = format || "mp3";
  } else {
    cobaltBody.downloadMode = "auto"; 
    cobaltBody.videoQuality = quality || "1080";
  }

  try {
    const cobaltResponse = await fetch(COBALT_INSTANCE, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cobaltBody),
    });

    const data = await cobaltResponse.json();

    // 🚀 FIX 1: Picker (Carousel) से सिर्फ वीडियो निकालें
    if (data.status === "picker" && Array.isArray(data.picker)) {
      if (type === "video") {
        const videoItem = data.picker.find(item => item.type === "video");
        if (videoItem) {
          return res.status(200).json({
            status: "success",
            url: videoItem.url,
            filename: videoItem.filename || "video.mp4"
          });
        } else {
          return res.status(400).json({
            status: "error",
            text: "इस लिंक में कोई वीडियो नहीं है, सिर्फ इमेजेस हैं। कृपया सही वीडियो लिंक डालें।"
          });
        }
      }
    }

    // 🚀 FIX 2: अगर सर्वर वीडियो की जगह इमेज भेज रहा है, तो उसे रोकें
    if (data.status === "redirect" || data.status === "tunnel") {
      let isImage = false;
      if (data.filename) {
        const lower = data.filename.toLowerCase();
        isImage = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
      } else if (data.url) {
        const cleanUrl = data.url.split('?')[0].toLowerCase();
        isImage = cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp');
      }

      if (type === "video" && isImage) {
        return res.status(400).json({
          status: "error",
          text: "यह लिंक एक इमेज का है, वीडियो का नहीं। कृपया सही वीडियो लिंक डालें।"
        });
      }
    }

    return res.status(cobaltResponse.status).json(data);
    
  } catch (err) {
    console.error("Render API error:", err);
    return res.status(500).json({
      status: "error",
      text: "सर्वर जाग रहा है या व्यस्त है। कृपया 1 मिनट बाद फिर से प्रयास करें।",
    });
  }
};
