// main.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { initializeApp, cert } from "npm:firebase-admin/app";
import { getFirestore, Timestamp } from "npm:firebase-admin/firestore";
import OpenAI from "npm:openai";

// ===== DEBUG LOGS =====
console.log("Checking environment variables...");

const firebaseSecretRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

console.log("Firebase secret exists:", !!firebaseSecretRaw);
console.log("OpenAI key exists:", !!openaiKey);

if (!firebaseSecretRaw) throw new Error("FIREBASE_SERVICE_ACCOUNT missing");
if (!openaiKey) throw new Error("OPENAI_API_KEY missing");

// ===== PARSE FIREBASE JSON SAFELY =====
let serviceAccount;
try {
  // Replace literal '\n' with real newlines in the private key
  const fixedJson = firebaseSecretRaw.replace(/\\n/g, "\n");
  serviceAccount = JSON.parse(fixedJson);
} catch (err) {
  console.error("Error parsing Firebase JSON:", err);
  throw err;
}

// ===== INITIALIZE FIREBASE =====
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ===== INITIALIZE OPENAI =====
const openai = new OpenAI({ apiKey: openaiKey });

// ===== START SERVER =====
console.log("🚀 Server running...");

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Send POST requests only", { status: 405 });
  }

  try {
    const { userId, message } = await req.json();
    if (!userId || !message) {
      return new Response(
        JSON.stringify({ error: "Missing userId or message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const conversationRef = db.collection("conversations").doc(userId);
    await conversationRef.set({ userId, created_at: Timestamp.now() }, { merge: true });

    const messagesRef = conversationRef.collection("messages");

    // Save user message
    await messagesRef.add({
      role: "user",
      content: message,
      created_at: Timestamp.now(),
    });

    // GPT response
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: message }],
    });

    const reply = aiResponse.choices[0]?.message?.content ?? "No response";

    // Save assistant message
    await messagesRef.add({
      role: "assistant",
      content: reply,
      created_at: Timestamp.now(),
    });

    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Server error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
