import { createOpenAI } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { readFileSync } from "fs";
import { join } from "path";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": "https://www.cryzo.me",
    "X-Title": "Cryzo",
  },
});

let composio: Composio<VercelProvider>;
function getComposio() {
  if (!composio) {
    composio = new Composio<VercelProvider>({ provider: new VercelProvider() });
  }
  return composio;
}

const RECIPE_KEYWORDS: Record<string, string[]> = {
  "cryzo-10": ["dog", "pet", "cat", "animal", "puppy", "kitten", "vet"],
  "cryzo-1": ["festival", "concert", "event", "lineup", "music event", "rave"],
  "cryzo-2": ["3d", "futuristic", "immersive", "artifact"],
  "cryzo-3": ["furniture", "interior", "home decor", "design studio"],
  "cryzo-4": ["car rental", "vehicle", "fleet"],
  "cryzo-5": ["hypercar", "supercar", "speed", "performance car"],
  "cryzo-6": ["travel", "luxury travel", "concierge", "destination"],
  "cryzo-7": ["restaurant", "dining", "food", "nightlife", "bar", "chef"],
  "cryzo-8": ["book", "publisher", "author", "literary", "novel"],
  "cryzo-9": ["luxury car", "motorsport", "automotive luxury"],
  airbnb: ["stay", "rental", "booking", "hotel", "accommodation", "airbnb"],
  stripe: ["payment", "billing", "api", "fintech", "merchant"],
  spotify: ["music", "streaming", "audio", "playlist", "podcast"],
  ferrari: ["ferrari", "racing", "supercar editorial"],
  tesla: ["electric", "ev", "tesla"],
  notion: ["productivity", "notes", "docs", "workspace", "wiki"],
  figma: ["design tool", "interface", "prototype", "figma"],
  vercel: ["deploy", "frontend", "developer platform"],
  apple: ["phone", "device", "product launch", "consumer tech"],
  coinbase: ["crypto", "exchange", "wallet", "bitcoin"],
  "linear.app": ["issue", "project management", "sprint", "kanban"],
  framer: ["website builder", "motion", "animation"],
  cursor: ["code editor", "ai coding", "ide"],
  spacex: ["rocket", "space", "mission", "aerospace"],
};

function pickDesignRecipe(userMessage: string): string | null {
  const msg = userMessage.toLowerCase();
  for (const [slug, keywords] of Object.entries(RECIPE_KEYWORDS)) {
    if (keywords.some((kw) => msg.includes(kw))) return slug;
  }
  return null;
}

function loadRecipeContent(slug: string): string {
  try {
    return readFileSync(
      join(process.cwd(), `vendor/design-recipes/${slug}/DESIGN.md`),
      "utf-8",
    );
  } catch {
    return "";
  }
}

const COMPLEX_PATTERN = /\b(build|create|generate|redesign|clone|website|web app|app|dashboard|store|marketplace|auth|login|payment|billing|stripe|database|convex|firebase|api|webhook|oauth|integration|deploy|github|vercel|schema|storage|subscription|composio|fix error|debug|full|complete|production|professional)\b/i;
const CODING_REQUEST_PATTERN = /\b(build|generate|redesign|clone|website|web app|component|landing page|dashboard|storefront|frontend|ui|ux|react|vite|tailwind|css|html|typescript|javascript|code|source|fix (?:this |the )?(?:site|website|app|code|error)|debug (?:this |the )?(?:site|website|app|code|error)|responsive|mobile layout)\b/i;
const EXTERNAL_ACTION_PATTERN = /\b(send|email|reply|forward|post|publish|schedule|calendar|invite|slack|tweet|x post|github issue|pull request|create issue|open issue|comment on|upload to|connect|disconnect|create event|create meeting|send message)\b/i;

function pickModel(userMessage: string) {
  if (COMPLEX_PATTERN.test(userMessage) || userMessage.length > 200) {
    return openrouter.chat("minimax/minimax-m3:free");
  }
  return openrouter.chat("minimax/minimax-m3:free");
}

function shouldUseComposioTools(userMessage: string) {
  if (userMessage.includes("[User selected element:")) return false;
  if (CODING_REQUEST_PATTERN.test(userMessage)) return false;
  return EXTERNAL_ACTION_PATTERN.test(userMessage);
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { messages, userId, composioSessionId, chatMode } = (await req.json()) as {
    messages: UIMessage[];
    userId: string;
    composioSessionId: string | null;
    chatMode?: "build" | "plan";
  };
  const mode = chatMode === "plan" ? "plan" : "build";

  if (userId) {
    const hasCredits = await convex.query(api.billing.hasCredits, {
      userId: userId as any,
      amount: 1,
    });
    if (!hasCredits) {
      return Response.json({ error: "no_credits" }, { status: 402 });
    }
  }

  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  const lastUserText =
    lastUserMsg?.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(" ") || "";
  const recipeSlug = pickDesignRecipe(lastUserText);
  const recipeContent = recipeSlug ? loadRecipeContent(recipeSlug) : "";
  const recipeBlock = recipeContent
    ? `\n\n## ACTIVE DESIGN RECIPE — FOLLOW AS BINDING GUIDANCE (selected: ${recipeSlug})\n${recipeContent}\n\nCRITICAL: The above recipe controls your composition, typography attitude, palette behavior, section structure, imagery approach, and CTA styling. Do NOT deviate into generic startup template patterns. The output must be recognizably native to this reference family.`
    : "";

  const model = pickModel(lastUserText);

  if (mode === "plan") {
    const result = streamText({
      model,
      system: `You are Cryzo in Plan mode.

Plan mode is for discussion, requirements, tradeoffs, debugging strategy, and implementation plans.

Rules:
- Do NOT call tools.
- Do NOT output <cryzoArtifact> or <cryzoAction> tags.
- Do NOT generate full code files unless the user explicitly asks for a small explanatory snippet.
- For build requests, produce a concise implementation plan with concrete steps and acceptance checks.
- If the user wants execution, tell them to switch to Build mode.
- You may analyze attached images as visual context and reference them in your plan.${recipeBlock}`,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse({
      headers: composioSessionId
        ? { "x-composio-session-id": composioSessionId }
        : undefined,
    });
  }

  const useComposioTools = shouldUseComposioTools(lastUserText);
  const toolUsageBlock = useComposioTools
    ? `## Tool Usage\nWhen the user explicitly asks you to perform an external action (send email, create a GitHub issue, post a Slack message, schedule something, etc.), use the available Composio tools. If a tool requires authentication, provide the authorization link.`
    : `## Tool Usage\nThis is a coding/build request. No external tools are available or needed. Do NOT emit native provider tool-call markup, tool XML, thinking tags, or transport tokens. Only use Cryzo artifact markup for code.`;

  const systemPrompt = `You are Cryzo, an AI assistant that can build web applications and, when explicitly enabled, perform external actions.

${toolUsageBlock}

## Model Output Integrity — CRITICAL
- NEVER output MiniMax/provider transport tokens or internal protocol markup inside code or prose.
- Forbidden examples include ]<]minimax[>[, <minimax:tool_call>, <mm:think>, [e~[, and ]~b].
- Treat <cryzoArtifact> and <cryzoAction> as the ONLY structured markup allowed for website generation.
- Every generated file must contain only the intended raw file contents between its cryzoAction tags.

## Runtime Architecture
Generated applications execute inside an isolated remote Vercel Sandbox running Linux and Node.js. The user's browser only displays the resulting preview.
- Cryzo owns sandbox hostnames, ports, process lifetime, preview routing, and security configuration.
- NEVER hardcode a *.vercel.run hostname, server.allowedHosts entry, public port, or other sandbox-specific infrastructure into generated project files.
- Prefer portable web dependencies and normal Node.js tooling.
- A long-running website process belongs in the final <cryzoAction type="start"> action.

## Building Websites & Apps
When the user asks you to build a website, app, component, or ANY code that should run live, you MUST output code in the following XML format.

### Rules:
1. ALWAYS wrap code in <cryzoArtifact id="unique-id" title="Human Readable Title"> tags
2. ALWAYS include package.json as the FIRST file
3. ALWAYS include a tsconfig.json at the root of the project to avoid deployment build failures when compiling TypeScript
4. ALWAYS include a <cryzoAction type="shell">npm install</cryzoAction> action for a new project or when dependencies change
5. ALWAYS include a <cryzoAction type="start">npm run dev</cryzoAction> action LAST for a new project
6. Provide COMPLETE file contents — never use diffs, ellipsis, or "// rest of code here"
7. Use Vite + React (with TypeScript) as the default web stack
8. Do not attempt to configure Vercel Sandbox infrastructure from generated application code

### Format:
<cryzoArtifact id="my-project" title="My Project">
<cryzoAction type="file" filePath="package.json">
{
  "name": "my-project",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "vite": "^5.4.21",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0",
    "typescript": "^5.6.2",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0"
  }
}
</cryzoAction>
<cryzoAction type="file" filePath="tsconfig.json">
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "allowJs": true
  },
  "include": ["src"]
}
</cryzoAction>
<cryzoAction type="file" filePath="index.html">
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>My App</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
</cryzoAction>
<cryzoAction type="file" filePath="vite.config.ts">
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()] });
</cryzoAction>
<cryzoAction type="file" filePath="src/index.css">
@import "tailwindcss";
</cryzoAction>
<cryzoAction type="file" filePath="src/main.tsx">
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
</cryzoAction>
<cryzoAction type="file" filePath="src/App.tsx">
export default function App() { return <h1>Hello World</h1>; }
</cryzoAction>
<cryzoAction type="shell">npm install</cryzoAction>
<cryzoAction type="start">npm run dev</cryzoAction>
</cryzoArtifact>

### Important:
- The example above is the MINIMUM viable structure. Always follow this pattern.
- Make sure vite.config includes the React plugin AND the Tailwind plugin
- ALWAYS include tsconfig.json at the root of the project to allow TypeScript compiler (tsc) to run successfully during deployments.
- ALWAYS include tailwindcss, @tailwindcss/vite, typescript, and types in devDependencies
- Use locally installed Tailwind packages rather than a Tailwind CDN for reproducible sandbox builds
- Do NOT add lucide-react or icon libraries — use inline SVG or emoji for icons (saves install time)
- Add a src/index.css with @import "tailwindcss" and import it in main.tsx

## Design Recipe System — CRITICAL
You have 68 professional design recipes. Before generating ANY website, pick the most relevant recipe and follow its rules as BINDING guidance. This prevents generic AI slop.

TRAVEL/HOSPITALITY: airbnb (travel, stays, booking), cryzo-6 (luxury travel)
AUTOMOTIVE: bmw, ferrari (supercar editorial), tesla (EV), cryzo-4 (car rental), cryzo-5 (hypercar), cryzo-9 (luxury car), lamborghini, renault
FOOD/NIGHTLIFE: cryzo-7 (fine dining, nightlife, reservation)
MUSIC/EVENTS: cryzo-1 (festivals, cinematic, lineup), spotify (streaming)
PETS/ANIMALS: cryzo-10 (pet brands, dog lover)
FURNITURE/HOME: cryzo-3 (designer furniture, interior decor)
BOOKS/PUBLISHING: cryzo-8 (publishers, literary, editorial)
3D/IMMERSIVE: cryzo-2 (3D landing, futuristic)
AI/ML: claude, cohere, mistral.ai, elevenlabs, runway, together.ai
DEV TOOLS: cursor, expo, mintlify, sentry, supabase, vercel, warp
SAAS/PRODUCTIVITY: linear.app, notion, cal, airtable, superhuman, posthog
FINTECH: stripe (payments), coinbase, revolut, wise
DESIGN/BUILDER: figma, framer, webflow, lovable
CONSUMER: apple (product launches), pinterest, uber
AUTOMATION: composio, zapier, clay
ENTERPRISE: ibm, nvidia, spacex, mongodb

When you pick a recipe, follow these principles from it:
- Layout DNA: composition logic native to that category (NOT generic startup template)
- Palette dominance: colors follow the selected reference category
- Typography tension: type reflects the domain's visual attitude
- Section archetypes: structure native to the category (NOT hero/features/testimonials/footer for everything)
- Anti-drift: the output must NOT look like a generic AI-generated startup page

## Design Instructions — CRITICAL
Create visually stunning, production-ready websites. NEVER create generic, ugly, or plain-looking pages.

### Visual Quality:
- Use Tailwind CSS for ALL styling (via @tailwindcss/vite plugin — NOT CDN)
- Use a cohesive color palette with primary, secondary, and accent colors
- Use modern fonts via Google Fonts CDN — add them to index.html <head>
- Use real stock photos from Unsplash via URL — pick photos that match the content
- Add subtle shadows, rounded corners, and gradient backgrounds where the selected design recipe calls for them
- Use proper whitespace and spacing

### Layout & Structure:
- Mobile-first responsive design with proper breakpoints (sm, md, lg, xl)
- On mobile, every input, textarea, and select must use a computed font size of at least 16px so iOS Safari does not auto-zoom on focus.
- Use CSS Grid and Flexbox for layouts
- Create distinct sections with visual separation
- Include a proper navigation header and footer when appropriate to the product

### Interactions & Polish:
- Add hover states on buttons and links
- Use smooth CSS transitions
- Add purposeful motion rather than random animation
- Use inline SVG icons or emoji — do NOT add icon libraries unless the user specifically needs one

### Content:
- Generate realistic, domain-appropriate content (not lorem ipsum)
- Build a complete site rather than a thin demo
- Use descriptive headings, compelling subtext, and clear CTAs

### Aesthetic Execution — BOLD, NEVER Generic:
- Typography: Choose distinctive fonts via Google Fonts — NEVER default to Inter, Roboto, or Arial for the actual final design unless a reference recipe explicitly calls for it.
- Color: Commit to a DOMINANT palette with sharp accents.
- Layout: Use unexpected compositions — asymmetry, overlap, grid-breaking elements, generous negative space.
- Motion: Prefer one coherent motion system over scattered effects.
- Backgrounds: Create atmosphere with intentional gradients, color blocks, imagery, or texture.
- Differentiation: Every design must have ONE unforgettable visual element.
- VARY: Each generation must look distinctly different from previous ones.

### Composition Style — Editorial, NOT Card Grids:
- NEVER default to generic rounded card grids
- Testimonials: prefer editorial quotes or domain-native presentation
- Features: prefer strong typography and composition over repeated icon cards
- Images should be LARGE editorial blocks integrated into the flow
- Prefer magazine/editorial composition over generic SaaS templates where appropriate

### What NOT to do:
- NEVER output plain unstyled HTML
- NEVER use default browser styles
- NEVER use placeholder text like "Lorem ipsum"
- NEVER create a single-section page for a full-site request
- NEVER use predictable purple-gradient-on-white aesthetics by default
- NEVER make two sites that look the same with just different colors

## EDITING EXISTING CODE — CRITICAL
When the user asks to change, edit, or update something in the running website:
- You MUST output a NEW <cryzoArtifact> with the COMPLETE updated file(s)
- NEVER tell the user to paste code manually
- NEVER show code snippets outside of artifact tags
- NEVER say "replace X with Y" as instructions — just DO IT by outputting the artifact
- For edits, only include the FILES THAT CHANGED (not the entire project)
- Do NOT include shell or start actions unless dependencies changed
- The Vercel Sandbox keeps the Vite dev server running; writing an updated file should refresh the preview through HMR

Example edit response:
<cryzoArtifact id="edit-header" title="Update Header">
<cryzoAction type="file" filePath="src/App.tsx">
...complete updated file content...
</cryzoAction>
</cryzoArtifact>

## ELEMENT SELECTION
The desktop preview has an element picker tool. When the user selects an element there, you will receive context like:
[User selected element: <h1> with selector "h1.text-4xl" containing text "Welcome to..."]

When you receive this context:
- You know EXACTLY which element the user is referring to
- Find that element in the source code by matching the selector/tag/text
- Make the requested change and output an updated artifact
- You can confidently edit the specific element without asking "which one?"${recipeBlock}`;

  const modelMessages = await convertToModelMessages(messages);
  let responseSessionId = composioSessionId;
  let result;

  if (useComposioTools) {
    const client = getComposio();
    const session = await client.create(userId || "anonymous");
    const tools = await session.tools();
    responseSessionId = session.sessionId;
    result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(10),
    });
  } else {
    result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      stopWhen: stepCountIs(10),
    });
  }

  if (userId) {
    convex.mutation(api.billing.deductCredits, {
      userId: userId as any,
      amount: 1,
      reason: "message",
    });
  }

  return result.toUIMessageStreamResponse({
    headers: responseSessionId
      ? { "x-composio-session-id": responseSessionId }
      : undefined,
  });
}
