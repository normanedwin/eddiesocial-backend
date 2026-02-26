// main.ts
import { initializeApp, cert } from "npm:firebase-admin/app";
import { getFirestore } from "npm:firebase-admin/firestore";
import OpenAI from "https://deno.land/x/openai@4.24.0/mod.ts";

// Load Firebase service account from Deno Deploy secret
const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);

// Initialize Firebase
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// Start Deno server
Deno.serve(async (req) => {
  if (req.method === "POST") {
    try {
      const { userId, message } = await req.json();

      // 1️⃣ Create a conversation document
      const convRef = await db.collection("conversations").add({
        userId,
        created_at: new Date().toISOString(),
      });

      // 2️⃣ Save user message
      await db.collection(convRef, "messages").add({
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
      });

      // 3️⃣ Get GPT reply
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: message }],
      });
      const gptReply = completion.choices[0].message.content;

      // 4️⃣ Save GPT reply
      await db.collection(convRef, "messages").add({
        role: "assistant",
        content: gptReply,
        created_at: new Date().toISOString(),
      });

      // 5️⃣ Return GPT reply
      return new Response(JSON.stringify({ reply: gptReply }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }
  }

  return new Response("Backend running 🚀");
});
