// main.ts
import { initializeApp, cert } from "npm:firebase-admin/app";
import { getFirestore, Timestamp } from "npm:firebase-admin/firestore";
import OpenAI from "https://deno.land/x/openai@4.23.0/mod.ts";

// Read Firebase service account from Deno Deploy secrets
const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);

// Initialize Firebase
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// Initialize OpenAI with your secret key
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// Simple HTTP server to handle POST requests
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";

console.log("Server running...");

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Only POST requests are allowed", { status: 405 });
  }

  try {
    const data = await req.json();
    const { userId, message } = data;

    if (!userId || !message) {
      return new Response(JSON.stringify({ error: "Missing userId or message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create or get conversation document
    const conversationRef = db.collection("conversations").doc(userId);
    const conversationSnap = await conversationRef.get();

    if (!conversationSnap.exists()) {
      await conversationRef.set({
        userId,
        created_at: Timestamp.now(),
      });
    }

    // Save user message in subcollection
    const messagesRef = conversationRef.collection("messages");
    await messagesRef.add({
      role: "user",
      content: message,
      created_at: Timestamp.now(),
    });

    // Get GPT reply
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0].message?.content ?? "Sorry, I could not respond.";

    // Save assistant message in Firestore
    await messagesRef.add({
      role: "assistant",
      content: reply,
      created_at: Timestamp.now(),
    });

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
