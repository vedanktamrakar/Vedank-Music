module.exports = async function handler(req, res) {
  // Sirf POST request allow karein
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "error", text: "Method not allowed" });
  }

  const { url, type, format, quality } = req.body || {};

  // Check karein ki URL mila ya nahi
  if (!url || typeof url !== "string") {
    return res.status(400).json({ status: "error", text: "URL is required" });
  }

  // Cobalt API ke liye body taiyar karein
  const cobaltBody = { url };

  if (type === "audio") {
    cobaltBody.isAudioOnly = true;
    cobaltBody.aFormat = format || "mp3";
  } else {
    cobaltBody.isAudioOnly = false;
    cobaltBody.vCodec = "h264";       // H.264 codec phones ke liye best hai
    cobaltBody.vQuality = quality || "720";
  }

  try {
    // Cobalt API ko call karein
    const cobaltResponse = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cobaltBody),
    });

    const data = await cobaltResponse.json();
    
    // Response wapas frontend ko bhej dein
    return res.status(cobaltResponse.status).json(data);
    
  } catch (err) {
    console.error("Cobalt API error:", err);
    return res.status(500).json({
      status: "error",
      text: "Download service se connect nahi ho paya. Thodi der baad try karein.",
    });
  }
};
