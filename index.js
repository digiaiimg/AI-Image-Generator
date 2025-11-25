const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

// ✔ YOUR REAL API KEY (safe in backend)
const API_KEY = "AIzaSyDIQzZLsx3KxSqyfJf-11Ue78zdQosa8pI";

app.post("/generate", async (req, res) => {
    const { prompt } = req.body;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters: { sampleCount: 1, aspectRatio: "16:9" }
                })
            }
        );

        const result = await response.json();
        const base64 = result.predictions?.[0]?.bytesBase64Encoded;

        if (!base64) return res.json({ error: "API returned no image" });

        res.json({ image: `data:image/png;base64,${base64}` });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.listen(3000, () => console.log("Backend running on port 3000"));
