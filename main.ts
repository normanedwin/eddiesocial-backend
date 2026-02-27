// ===== IMPORTS =====
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { initializeApp, cert } from "npm:firebase-admin/app";
import { getFirestore, Timestamp } from "npm:firebase-admin/firestore";
import OpenAI from "npm:openai";

// ===== ENV VARIABLES =====
const firebaseSecret = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

if (!firebaseSecret) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT is missing");
}

if (!openaiKey) {
  throw new Error("OPENAI_API_KEY is missing");
}

// ===== FIREBASE INIT =====
const serviceAccount = JSON.parse(firebaseSecret);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// ===== OPENAI INIT =====
const openai = new OpenAI({
  apiKey: openaiKey,
});

// ===== SERVER =====
console.log("🚀 Server running...");

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Send POST request", { status: 405 });
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

    await conversationRef.set(
      {
        userId,
        created_at: Timestamp.now(),
      },
      { merge: true }
    );

    const messagesRef = conversationRef.collection("messages");

    // Save user message
    await messagesRef.add({
      role: "user",
      content: message,
      created_at: Timestamp.now(),
    });

    // Get GPT reply
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: message }],
    });

    const reply =
      aiResponse.choices[0]?.message?.content ?? "No response.";

    // Save AI message
    await messagesRef.add({
      role: "assistant",
      content: reply,
      created_at: Timestamp.now(),
    });

    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: "Server error", details: String(error) }),
      { status: 500 }
    );
  }
});
