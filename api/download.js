// api/download.js — Vercel Serverless Function (Cobalt v11+ Compatible)

// आपका नया Render URL
const COBALT_INSTANCE = "https://cobalt-latest-33pl.onrender.com";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "error", text: "Method not allowed" });
  }

  const { url, type, format, quality } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ status: "error", text: "URL is required" });
  }

  // Cobalt v11+ के लिए नया फॉर्मेट
  const cobaltBody = { url };

  if (type === "audio") {
    cobaltBody.downloadMode = "audio";
    cobaltBody.audioFormat = format || "mp3";
  } else {
    cobaltBody.downloadMode = "auto"; // वीडियो के लिए
    cobaltBody.videoQuality = quality || "720";
  }

  try {
    // Render सर्वर को कॉल करें
    const cobaltResponse = await fetch(COBALT_INSTANCE, {
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
    console.error("Render API error:", err);
    return res.status(500).json({
      status: "error",
      text: "सर्वर जाग रहा है या व्यस्त है। कृपया 1 मिनट बाद फिर से प्रयास करें।",
    });
  }
};
