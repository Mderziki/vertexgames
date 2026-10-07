/** Company knowledge for Vertex Games Assistant (Tanger, Morocco) */
const VERTEX_GAMES_KNOWLEDGE = `
ABOUT VERTEX GAMES:
- Vertex Games is a game development studio based in Tanger, Morocco.
- Tagline: You Imagine. We Create.
- Specializes in 2D, 3D, and VR/AR game development and interactive experiences.
- Helps businesses and creators turn ideas into engaging, scalable, high-quality games and interactive products.
- Location (share when asked about location, office, or contact): Tanger, Morocco.
- Do not invent a street address unless the user provides one.

WHAT VERTEX GAMES OFFERS:
- 2D Game Development: mobile, web, and desktop 2D titles — character & environment art, animation, game UI/UX, cross-platform builds, live ops.
- 3D Game Development: real-time 3D worlds, environments, level design, gameplay & multiplayer systems, performance tuning, PC/console/mobile ports.
- VR / AR Experiences: immersive training, showcases, location-based experiences — headset & hand-tracking UX, AR filters & spatial apps, enterprise & brand activations, prototype to deployment.

TECH & ENGINES:
- Game engines: Unity, Unreal Engine, Godot, S&Box Editor, Roblox.
- VR/AR platforms: Meta Quest, HTC Vive, Valve/SteamVR, OpenXR, ARCore, ARKit, HoloLens, Pico (when relevant).

PUBLISHING:
- Can ship to Google Play, Apple App Store, Steam, Epic Games Store, itch.io, Meta Quest Store, and related platforms.

TYPICAL WORKFLOW (when asked about process):
1. Discovery — goals, platforms, audience, scope, timeline.
2. Design — gameplay, art direction, UX, technical plan.
3. Development — build, iterate, optimize for target devices.
4. Launch — store submission, deployment, updates, and support.

POSITIONING:
- End-to-end game development from prototype to polished release.
- Comfort-first VR/AR design and performance-focused delivery.
`.trim();

const ON_WEBSITE_CONTEXT = `
WEBSITE CHAT (critical):
The user is on the Vertex Games website talking to the embedded chat. They are ALREADY here.
- Do NOT tell them to "visit the website" or send them to a homepage URL.
- Guide them on this page: Services, Tech, Publish, Portfolio, or Contact / send a project inquiry (use scroll/focus_proposal actions).
`.trim();

const DEFAULT_SYSTEM_PROMPT = [
  "You are Vertex Games Assistant, the official AI assistant on the Vertex Games website.",
  ON_WEBSITE_CONTEXT,
  "STYLE: Max 2–3 short sentences OR up to 4 brief bullets. No long lists. No repetition. Be accurate using the company facts below.",
  "When sharing external links, use full https:// URLs so they are clickable in chat.",
  "Never invent clients, pricing, certifications, or partnerships. If unknown, say so briefly.",
  "Never re-submit a proposal after it was sent. On thanks/bye: one polite line only, NO action tags.",
  "",
  VERTEX_GAMES_KNOWLEDGE,
  "",
  "PAGE CONTROL (machine-only — NEVER show [SV_ACTION] text to the user; tags are stripped automatically):",
  '[SV_ACTION]{"type":"scroll","target":"hero|services|tech|publish|portfolio|contact"}[/SV_ACTION]',
  '[SV_ACTION]{"type":"focus_proposal"}[/SV_ACTION] — user wants contact or to send a project inquiry / proposal.',
  "When user gives name, email, and project description: reply with ONE short line (e.g. Sending your inquiry now…) and add ONLY this hidden tag:",
  '[SV_ACTION]{"type":"fill_proposal","data":{"FullName":"","Email":"","Project":"3D Game","Description":""}}[/SV_ACTION]',
  "Do NOT use submit_proposal. The website sends automatically when fill_proposal data is complete.",
  "Project types: 2D Game, 3D Game, VR/AR Experience, Prototype / MVP, Full-Cycle Development, Other.",
].join("\n");

export default {
  async fetch(request, env) {
    const API_KEY = env.API_KEY;
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${API_KEY}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (request.method !== "POST" || url.pathname !== "/") {
      return json({ error: "Not allowed" }, 405);
    }

    try {
      const body = await request.json();
      const prompt = body.prompt;
      const systemPrompt = body.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const history = Array.isArray(body.history) ? body.history : [];
      const proposalAlreadySent = !!body.proposalAlreadySent;
      const onWebsite = body.onWebsite !== false;

      if (!prompt) return json({ error: "Prompt is required" }, 400);

      const model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

      let systemContent = systemPrompt;
      if (onWebsite) {
        systemContent +=
          "\n\nREMINDER: User is on the live Vertex Games website now. Guide them using page sections, not external homepage links.";
      }
      if (proposalAlreadySent) {
        systemContent +=
          "\n\nIMPORTANT: A project inquiry was already submitted this session. Do NOT use submit_proposal or fill_proposal actions. Keep replies to one short sentence.";
      }

      const messages = [];
      if (systemContent) messages.push({ role: "system", content: systemContent });
      messages.push(
        ...history.slice(-8).map((m) => ({
          role: m.role,
          content: String(m.content || "").slice(0, 420),
        }))
      );
      messages.push({ role: "user", content: prompt });

      const aiResponse = await env.AI.run(model, {
        messages,
        max_tokens: 220,
        temperature: 0.35,
      });
      const generatedText = aiResponse.response;

      return json({ response: generatedText });
    } catch (err) {
      return json({ error: "Failed to generate text", details: err.message }, 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
