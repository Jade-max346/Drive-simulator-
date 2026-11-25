import express from "express";
import { Mistral } from "@mistralai/mistralai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const MODEL = "mistral-small-latest";

if (!process.env.MISTRAL_API_KEY) {
  console.error("Erreur : MISTRAL_API_KEY n'est pas défini. Créez un fichier .env (voir .env.example).");
  process.exit(1);
}

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const STORY_SYSTEM_PROMPT =
  "Tu es un auteur de fiction creatif. A partir du prompt de l'utilisateur, " +
  "ecris une histoire originale, immersive et bien structuree en francais " +
  "(introduction, developpement, chute). Utilise des paragraphes courts. " +
  "Adapte le ton et le genre a la demande. Longueur indicative : 400 a 700 mots.";

app.post("/api/story", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    return res.status(400).json({ error: "Le champ 'prompt' est requis." });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: "Le prompt est trop long (4000 caracteres max)." });
  }

  try {
    const response = await client.chat.complete({
      model: MODEL,
      messages: [
        { role: "system", content: STORY_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });
    const story = response?.choices?.[0]?.message?.content;
    if (!story) {
      return res.status(502).json({ error: "Reponse vide du modele." });
    }
    res.json({ story, model: MODEL });
  } catch (err) {
    const status = err?.statusCode || 500;
    console.error("Erreur API Mistral :", err?.message || err);
    res.status(status).json({ error: "Echec de la generation : " + (err?.message || "erreur inconnue") });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur demarre sur http://localhost:${PORT} (modele : ${MODEL})`);
});
