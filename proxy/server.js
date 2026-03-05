import express from "express";

const app = express();
const port = Number(process.env.PORT || 8787);
const engineBase = (process.env.VOICEVOX_ENGINE_URL || "http://127.0.0.1:50021").replace(/\/+$/, "");
const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowAll = allowedOrigins.includes("*");
  if (allowAll) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, engineBase });
});

app.get("/voicevox/speakers", async (_req, res) => {
  try {
    const r = await fetch(`${engineBase}/speakers`);
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (error) {
    res.status(502).json({ error: "speakers_failed", detail: String(error) });
  }
});

app.post("/voicevox/audio_query", async (req, res) => {
  const text = req.query.text || "";
  const speaker = req.query.speaker || "";
  try {
    const r = await fetch(
      `${engineBase}/audio_query?text=${encodeURIComponent(String(text))}&speaker=${encodeURIComponent(String(speaker))}`,
      { method: "POST" },
    );
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (error) {
    res.status(502).json({ error: "audio_query_failed", detail: String(error) });
  }
});

app.post("/voicevox/synthesis", async (req, res) => {
  const speaker = req.query.speaker || "";
  try {
    const r = await fetch(`${engineBase}/synthesis?speaker=${encodeURIComponent(String(speaker))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const buffer = Buffer.from(await r.arrayBuffer());
    res.status(r.status).type(r.headers.get("content-type") || "audio/wav").send(buffer);
  } catch (error) {
    res.status(502).json({ error: "synthesis_failed", detail: String(error) });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`voicevox proxy listening on :${port} -> ${engineBase}`);
});
