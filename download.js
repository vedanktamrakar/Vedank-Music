// api/download.js — Vercel Serverless Function
// POST /api/download
// Body: { url, type: "video"|"audio", format, quality }
// Proxies the request to Cobalt API to avoid CORS issues.

module.exports = async function handler(req, res) {
  // Only POST allowed
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "error", text: "Method not allowed" });
  }

  const { url, type, format, quality } = req.body || {};

  // Basic validation
  if (!url || typeof url !== "string") {
    return res.status(400).json({ status: "error", text: "URL is required" });
  }

  // Build the Cobalt request body
  const cobaltBody = { url };

  if (type === "audio") {
    cobaltBody.isAudioOnly = true;
    cobaltBody.aFormat = format || "mp3";
  } else {
    cobaltBody.isAudioOnly = false;
    cobaltBody.vCodec = "h264";       // Widely compatible with phones
    cobaltBody.vQuality = quality || "720";
  }

  try {
    const cobaltResponse = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cobaltBody),
    });

    const data = await cobaltResponse.json();
    return res.status(cobaltResponse.status).json(data);
  } catch (err) {
    console.error("Cobalt API error:", err);
    return res.status(500).json({
      status: "error",
      text: "Could not reach the download service. Please try again.",
    });
  }
};
