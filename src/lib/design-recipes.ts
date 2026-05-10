import type { UIMessage } from "ai";

export interface DesignCompositionRecipe {
  id: string;
  label: string;
  whenToUse: string;
  heroStructure: string;
  sectionOrder: string[];
  headlineImageRelationship: string;
  layeringRules: string[];
  typeScaleRelationship: string;
  paletteDistribution: string;
  imageFraming: string;
  asymmetry: string;
  ctaPosture: string;
}

export interface DesignReferenceProfile {
  slug: string;
  title: string;
  visualIntent: string;
  categories: string[];
  keywords: string[];
  styleKeywords: string[];
  compositionRecipes: DesignCompositionRecipe[];
  signatureMarkers: string[];
  mustKeep: string[];
  mustAvoid: string[];
  antiPatterns: string[];
  failConditions: string[];
}

export interface DesignRoutingResult {
  primary: DesignReferenceProfile | null;
  score: number;
  matchedSignals: string[];
  ranked: Array<{ slug: string; score: number; matchedSignals: string[] }>;
}

const MINIMUM_REFERENCE_SCORE = 8;
const LOW_SIGNAL_FALLBACK_SLUGS = ["apple", "stripe", "linear"];

const REFERENCES: DesignReferenceProfile[] = [
  {
    slug: "cryzo-10",
    title: "Cryzo 10 Pets Editorial",
    visualIntent:
      "A playful editorial pet lane: fashion-forward, expressive, premium, and character-rich without becoming childish.",
    categories: ["pets", "creative", "editorial", "commerce"],
    keywords: [
      "pet",
      "pets",
      "dog",
      "dogs",
      "cat",
      "cats",
      "feline",
      "whisker",
      "animal",
      "veterinary",
      "grooming",
      "pet store",
      "pet care",
      "adoption",
    ],
    styleKeywords: ["playful", "editorial", "fashion", "premium", "weird", "poster"],
    compositionRecipes: [
      {
        id: "poster-pet-editorial",
        label: "Poster Pet Editorial",
        whenToUse: "Use for pet, dog, cat, animal-care, grooming, adoption, or pet-commerce sites.",
        heroStructure:
          "Build a poster-like hero with hard color fields, giant expressive type, and one art-directed animal image cropped with intent.",
        sectionOrder: [
          "Poster hero with oversized headline, hard color field, and editorial animal image.",
          "Attitude or manifesto chapter with sparse, cheeky copy.",
          "Collection, service, gallery, or story section framed like a fashion spread.",
          "Asymmetric proof or culture chapter with image/type tension.",
          "Commanding poster-panel CTA close.",
        ],
        headlineImageRelationship:
          "Let the headline compete with the animal image; avoid polite side-by-side balance.",
        layeringRules: [
          "Use real fields of sour yellow, pink, powder blue, black, or off-white instead of tiny accent color.",
          "Let image crops, headline slabs, and chapter panels collide deliberately.",
          "Use cards only if they feel like editorial clippings, not generic feature cards.",
        ],
        typeScaleRelationship:
          "Use loud display type, condensed uppercase punches, expressive serif interruptions, and intentionally awkward line breaks.",
        paletteDistribution:
          "Hard color blocks should dominate whole sections; do not soften the page into tasteful neutral premium branding.",
        imageFraming:
          "Use surreal, fashion-editorial, or sharply cropped pet imagery; never cute stock pet-shop framing.",
        asymmetry:
          "Embrace strange breathing room, compression, and asymmetry instead of neat startup balance.",
        ctaPosture:
          "CTA should feel like a poster command or club invitation, not a generic rounded SaaS button wall.",
      },
    ],
    signatureMarkers: [
      "Poster-like vertical chapters with hard section breaks.",
      "Giant acidic display type that competes with imagery.",
      "Fashion-editorial animal photography with hard crops.",
      "Camp, art-directed, cheeky tone.",
    ],
    mustKeep: [
      "Keep at least one loud typographic moment.",
      "Keep at least one confrontational color-field moment.",
      "Keep the pet imagery editorial, not stock lifestyle.",
      "Keep the section rhythm closer to manifesto chapters than hero/features/testimonials/footer.",
    ],
    mustAvoid: [
      "Do not tidy the page into a balanced centered hero and feature-card grid.",
      "Do not use generic dark SaaS gradients as the main visual idea.",
      "Do not flatten the type into one safe sans-serif system.",
      "Do not turn the result into ordinary pet ecommerce.",
    ],
    antiPatterns: [
      "Generic gallery landing page.",
      "Cute pet-shop template.",
      "Balanced premium startup page.",
    ],
    failConditions: [
      "The page could be mistaken for a generic agency or startup landing page.",
      "The hard color-field logic disappears.",
      "The animal imagery looks like stock ecommerce photography.",
    ],
  },
  {
    slug: "cryzo-6",
    title: "Cryzo 6 Travel Concierge",
    visualIntent:
      "An effortless-luxury travel concierge lane built around atmosphere, editorial serif headlines, curated journeys, and guided service clarity.",
    categories: ["travel", "hospitality", "luxury", "service"],
    keywords: ["travel", "trip", "journey", "destination", "hotel", "concierge", "vacation", "booking", "resort"],
    styleKeywords: ["editorial", "luxury", "cinematic", "calm"],
    compositionRecipes: [
      {
        id: "concierge-editorial",
        label: "Concierge Editorial",
        whenToUse: "Use for travel, destination, hospitality, hotel, and concierge service sites.",
        heroStructure:
          "Build a destination-led hero with atmospheric imagery, elegant serif display type, and clear guided-service intent.",
        sectionOrder: [
          "Atmospheric destination hero.",
          "Curated journeys chapter.",
          "Concierge process section.",
          "Trust, testimonials, or founder credibility.",
          "Calm planning CTA.",
        ],
        headlineImageRelationship:
          "Typography should sit inside the travel atmosphere, not in a detached SaaS copy column.",
        layeringRules: [
          "Layer soft luminous color, real destination images, and restrained controls.",
          "Avoid commodity booking-card grids unless the prompt asks for booking inventory.",
        ],
        typeScaleRelationship: "Large elegant serif display leads; utility text stays calm and subordinate.",
        paletteDistribution: "Use dark atmospheric foundations with warm, luminous destination accents.",
        imageFraming: "Imagery should feel curated and transportive, not generic tourism thumbnails.",
        asymmetry: "Use editorial asymmetry gently, with enough service clarity to remain usable.",
        ctaPosture: "CTA should feel like beginning a guided planning conversation.",
      },
    ],
    signatureMarkers: ["Atmospheric destination hero.", "Elegant serif display.", "Concierge service clarity."],
    mustKeep: ["Keep travel atmosphere strong.", "Keep service flow clear.", "Keep imagery curated."],
    mustAvoid: ["Do not turn it into an OTA booking engine.", "Do not use generic SaaS feature cards."],
    antiPatterns: ["Flight-search UI when not requested.", "Commodity travel cards.", "AI planner dashboard chrome."],
    failConditions: ["The hero becomes a plain stock banner.", "The page reads like travel-tech SaaS."],
  },
  {
    slug: "cryzo-7",
    title: "Cryzo 7 Dining Nightlife",
    visualIntent:
      "A cinematic fine-dining nightlife lane with dark atmosphere, prestige typography, vivid food imagery, and sharp booking intent.",
    categories: ["restaurant", "dining", "hospitality", "nightlife"],
    keywords: ["restaurant", "dining", "chef", "menu", "reservation", "bar", "nightlife", "sushi", "food", "wine"],
    styleKeywords: ["cinematic", "luxury", "editorial", "nocturnal"],
    compositionRecipes: [
      {
        id: "nocturnal-dining",
        label: "Nocturnal Dining",
        whenToUse: "Use for restaurant, bar, chef, menu, and nightlife sites.",
        heroStructure:
          "Build a dark cinematic hero around food, chef, or venue imagery with prestige typography and immediate booking intent.",
        sectionOrder: ["Cinematic dining hero.", "Menu or tasting chapter.", "Ambiance and experience story.", "Awards or social proof.", "Reservation close."],
        headlineImageRelationship: "Let type and food imagery create sensory drama instead of a generic restaurant card layout.",
        layeringRules: ["Use black lacquer framing, warm ivory type, and vivid red or ember accents.", "Keep booking controls compact and intentional."],
        typeScaleRelationship: "Elegant serif display leads; utility text and menu labels stay precise.",
        paletteDistribution: "Dark black-red-ivory contrast should dominate.",
        imageFraming: "Use image-led menu and venue browsing, not plain text lists.",
        asymmetry: "Use editorial cropping and nocturnal negative space.",
        ctaPosture: "Booking CTA should feel immediate, premium, and easy to find.",
      },
    ],
    signatureMarkers: ["Dark food imagery.", "Prestige serif type.", "Compact red booking intent."],
    mustKeep: ["Keep strong food or venue imagery.", "Keep booking visible.", "Keep nocturnal mood."],
    mustAvoid: ["Do not make it a food delivery interface.", "Do not use bright casual-chain styling."],
    antiPatterns: ["Coupon banners.", "Delivery app controls.", "Generic black-and-gold luxury without imagery."],
    failConditions: ["The page reads like restaurant SaaS.", "The food imagery and red-black contrast disappear."],
  },
  {
    slug: "cryzo-3",
    title: "Cryzo 3 Furniture Showcase",
    visualIntent:
      "A premium furniture and interior object lane built around tactile object photography, quiet showroom rhythm, and cinematic domestic space.",
    categories: ["furniture", "interior", "commerce", "luxury"],
    keywords: ["furniture", "chair", "chairs", "sofa", "table", "interior", "home decor", "showroom", "lamp"],
    styleKeywords: ["premium", "cinematic", "editorial", "tactile"],
    compositionRecipes: [
      {
        id: "object-showroom",
        label: "Object Showroom",
        whenToUse: "Use for furniture, interior, home decor, and object-commerce sites.",
        heroStructure:
          "Build a tactile showroom hero around one dominant object or room scene with restrained editorial typography.",
        sectionOrder: ["Object-led showroom hero.", "Material or craft chapter.", "Curated collection section.", "Room or lifestyle spread.", "Quiet shop or consult CTA."],
        headlineImageRelationship: "The object or room scene must carry the hero; copy frames it with restraint.",
        layeringRules: ["Use generous whitespace, warm shadows, and object scale.", "Avoid noisy ecommerce grids as the first impression."],
        typeScaleRelationship: "Use elegant display type balanced with quiet product metadata.",
        paletteDistribution: "Use warm neutrals, deep contrast, and material colors; avoid flat beige monotony.",
        imageFraming: "Frame objects as designed artifacts, not catalog thumbnails.",
        asymmetry: "Use controlled asymmetry and museum-like spacing.",
        ctaPosture: "CTA should feel like a showroom action: view collection, book consult, or request catalog.",
      },
    ],
    signatureMarkers: ["Object-led hero.", "Tactile material detail.", "Showroom rhythm."],
    mustKeep: ["Keep products visually dominant.", "Keep materiality clear."],
    mustAvoid: ["Do not start with generic ecommerce cards.", "Do not make it flat beige."],
    antiPatterns: ["Catalog grid first.", "Generic home decor template."],
    failConditions: ["The furniture feels like commodity thumbnails.", "The hero lacks a dominant object or room scene."],
  },
  {
    slug: "cryzo-1",
    title: "Cryzo 1 Festival World",
    visualIntent:
      "A festival and event lane with poster energy, lineup rhythm, ticket urgency, and immersive cultural atmosphere.",
    categories: ["events", "music", "festival", "creative"],
    keywords: ["festival", "concert", "event", "lineup", "tickets", "music", "stage", "conference"],
    styleKeywords: ["poster", "editorial", "cinematic", "energetic"],
    compositionRecipes: [
      {
        id: "festival-poster",
        label: "Festival Poster",
        whenToUse: "Use for festivals, concerts, conferences, and event landing pages.",
        heroStructure: "Build a poster-first event hero with date, location, lineup energy, and strong ticket action.",
        sectionOrder: ["Poster hero.", "Lineup or speakers.", "Experience chapters.", "Schedule or venue info.", "Ticket CTA close."],
        headlineImageRelationship: "Type should feel like event poster typography, not SaaS marketing copy.",
        layeringRules: ["Layer date, venue, lineup, and image texture with deliberate poster hierarchy."],
        typeScaleRelationship: "Use expressive display scale and compact event metadata.",
        paletteDistribution: "Use event-specific color fields and high contrast.",
        imageFraming: "Use crowd, artist, stage, or culture imagery as atmosphere.",
        asymmetry: "Use dynamic poster asymmetry.",
        ctaPosture: "Ticket CTA should be loud, direct, and repeated where useful.",
      },
    ],
    signatureMarkers: ["Poster event hero.", "Lineup rhythm.", "Ticket urgency."],
    mustKeep: ["Keep date/location visible.", "Keep event energy high."],
    mustAvoid: ["Do not make it a generic conference SaaS site."],
    antiPatterns: ["Feature-card marketing stack.", "Weak ticket action."],
    failConditions: ["No clear event information.", "No poster-like visual hierarchy."],
  },
  {
    slug: "cryzo-8",
    title: "Cryzo 8 Books Editorial",
    visualIntent:
      "A literary/editorial lane with calm pacing, bookish typography, atmospheric story sections, and publisher-grade restraint.",
    categories: ["books", "publishing", "content", "editorial"],
    keywords: ["book", "books", "author", "novel", "publisher", "library", "reading", "literary", "magazine"],
    styleKeywords: ["editorial", "calm", "literary", "premium"],
    compositionRecipes: [
      {
        id: "literary-chapters",
        label: "Literary Chapters",
        whenToUse: "Use for books, authors, publishers, magazines, and literary brands.",
        heroStructure: "Build a literary hero around a cover, excerpt, author, or atmospheric story image.",
        sectionOrder: ["Literary hero.", "Featured titles or story chapter.", "Author/editorial proof.", "Reading list or excerpts.", "Subscribe or buy close."],
        headlineImageRelationship: "Type should feel bookish and chaptered; images should support story mood.",
        layeringRules: ["Use page-like spacing, serif contrast, and restrained image placement."],
        typeScaleRelationship: "Serif display and readable body rhythm matter more than visual noise.",
        paletteDistribution: "Use paper, ink, and atmospheric accent colors without becoming plain.",
        imageFraming: "Use covers, author portraits, archives, or still-life imagery.",
        asymmetry: "Use calm editorial asymmetry.",
        ctaPosture: "CTA should feel like read, buy, or subscribe.",
      },
    ],
    signatureMarkers: ["Bookish serif hierarchy.", "Chaptered pacing.", "Story atmosphere."],
    mustKeep: ["Keep typography readable and literary.", "Keep the page chaptered."],
    mustAvoid: ["Do not turn it into generic SaaS or ecommerce."],
    antiPatterns: ["Card-heavy blog template.", "Plain unstyled reading list."],
    failConditions: ["No literary mood.", "No clear book/story structure."],
  },
  {
    slug: "cryzo-2",
    title: "Cryzo 2 Spatial World",
    visualIntent:
      "A spatial, cinematic, artifact-led lane for immersive objects, futuristic worlds, and symbolic systems.",
    categories: ["3d", "spatial", "immersive", "creative", "ai"],
    keywords: ["3d", "spatial", "immersive", "world", "artifact", "futuristic", "webgl", "scene", "interactive"],
    styleKeywords: ["spatial", "cinematic", "futuristic", "atmospheric"],
    compositionRecipes: [
      {
        id: "artifact-world",
        label: "Artifact World",
        whenToUse: "Use for immersive, spatial, 3D, futuristic, artifact, or world-building prompts.",
        heroStructure: "Build a scene-first hero around one dominant symbolic object, artifact, or spatial environment.",
        sectionOrder: ["Scene-first hero.", "System or artifact explanation.", "Capability chapters.", "Interactive or depth showcase.", "World-entry CTA."],
        headlineImageRelationship: "Copy should frame the scene; the artifact/world remains dominant.",
        layeringRules: ["Use perspective, depth planes, atmospheric lighting, and subtle motion.", "Do not call a flat dark page 3D."],
        typeScaleRelationship: "Oversized editorial type plus compact system metadata.",
        paletteDistribution: "Dark foundations with controlled luminous accents.",
        imageFraming: "Use a real 3D/canvas scene when appropriate, or convincing CSS depth if simpler.",
        asymmetry: "Use spatial asymmetry and foreground/background relationships.",
        ctaPosture: "CTA should feel like entering, exploring, or activating the system.",
      },
    ],
    signatureMarkers: ["Dominant artifact or world.", "Atmospheric depth.", "System metadata."],
    mustKeep: ["Keep scene presence strong.", "Keep one dominant object or world idea."],
    mustAvoid: ["Do not default to dark SaaS.", "Do not invent cars unless the user asks for vehicles."],
    antiPatterns: ["Flat dark page called immersive.", "Generic futuristic startup hero."],
    failConditions: ["No dominant artifact.", "The page reads like ordinary SaaS."],
  },
  {
    slug: "composio",
    title: "Composio Automation Platform",
    visualIntent:
      "A technical automation/developer platform lane for tools, integrations, agents, and connected-service workflows.",
    categories: ["automation", "developer", "ai", "integrations"],
    keywords: ["automation", "integrations", "integration", "workflow", "agent", "tool calling", "api", "sdk", "github", "slack", "gmail"],
    styleKeywords: ["technical", "developer", "system", "precise"],
    compositionRecipes: [
      {
        id: "integration-system",
        label: "Integration System",
        whenToUse: "Use for automation platforms, agent tools, integration hubs, SDKs, and developer products.",
        heroStructure:
          "Build a developer-system hero with clear orchestration concept, integration graph or workflow surface, and precise product value.",
        sectionOrder: ["Technical orchestration hero.", "Integration or tool graph.", "Developer workflow section.", "Security/proof section.", "Docs or start-building CTA."],
        headlineImageRelationship: "Use diagrams, code, workflow surfaces, or integration maps instead of decorative blobs.",
        layeringRules: ["Prefer precise interface surfaces, node maps, and code panels.", "Avoid generic purple SaaS gradients."],
        typeScaleRelationship: "Use crisp display type with monospace metadata and code accents.",
        paletteDistribution: "Dark or light technical palette with restrained accent color and high legibility.",
        imageFraming: "Show the actual workflow, API, tool graph, or dashboard-like surface.",
        asymmetry: "Use product-interface asymmetry with clear scan paths.",
        ctaPosture: "CTA should point to docs, connect app, start building, or run workflow.",
      },
    ],
    signatureMarkers: ["Integration graph.", "Developer workflow surface.", "Code/metadata accents."],
    mustKeep: ["Keep product mechanics visible.", "Keep developer clarity high."],
    mustAvoid: ["Do not use vague AI magic language.", "Do not hide the workflow behind abstract decoration."],
    antiPatterns: ["Purple-on-dark generic AI SaaS.", "Decorative orb hero.", "No visible product concept."],
    failConditions: ["The page does not communicate integrations.", "The hero lacks any workflow or tool surface."],
  },
  {
    slug: "apple",
    title: "Apple Product Launch",
    visualIntent:
      "A launch-first consumer hardware system built on obsessive restraint, oversized product imagery, quiet chrome, and premium confidence.",
    categories: ["hardware", "mobile", "consumer", "product"],
    keywords: ["phone", "iphone", "smartphone", "device", "laptop", "hardware", "watch", "headphones", "product launch"],
    styleKeywords: ["minimal", "premium", "cinematic", "restrained"],
    compositionRecipes: [
      {
        id: "keynote-object",
        label: "Keynote Object",
        whenToUse: "Use for consumer hardware, product launches, and device showcases.",
        heroStructure: "Build a keynote-style hero anchored by one dominant product object and quiet negative space.",
        sectionOrder: ["Keynote hero.", "Focused capability bands.", "Cinematic product gallery.", "Quiet compare or buy close."],
        headlineImageRelationship: "Headline frames the product with restraint; the product object remains dominant.",
        layeringRules: ["Keep layering sparse and exact.", "Avoid decorative layers without purpose."],
        typeScaleRelationship: "Controlled, deliberate scale led by the product frame.",
        paletteDistribution: "Restrained tonal palette with sparse accent color.",
        imageFraming: "Center the product object and make it tangible.",
        asymmetry: "Use restrained category-correct asymmetry.",
        ctaPosture: "Sparse, exact, product-native CTAs.",
      },
    ],
    signatureMarkers: ["One dominant product object.", "Severe restraint.", "Quiet premium confidence."],
    mustKeep: ["Keep the object dominant.", "Keep chrome quiet."],
    mustAvoid: ["Do not inject busy feature grids.", "Do not use generic startup gradients."],
    antiPatterns: ["Busy SaaS stack.", "Decorative chaos."],
    failConditions: ["The product object is not dominant.", "The page feels like startup marketing."],
  },
  {
    slug: "stripe",
    title: "Stripe Fintech Platform",
    visualIntent:
      "A fintech/platform lane with clear systems thinking, conversion clarity, product surfaces, and credible business polish.",
    categories: ["payments", "fintech", "platform", "commerce"],
    keywords: ["payment", "payments", "checkout", "billing", "invoice", "subscription", "fintech", "merchant", "finance"],
    styleKeywords: ["polished", "business", "platform", "credible"],
    compositionRecipes: [
      {
        id: "platform-surfaces",
        label: "Platform Surfaces",
        whenToUse: "Use for payments, fintech, checkout, billing, and business platform sites.",
        heroStructure: "Build a platform hero with product surfaces, business value, and credible conversion path.",
        sectionOrder: ["Platform hero.", "Product surfaces.", "Business use cases.", "Trust/security proof.", "Start or contact sales CTA."],
        headlineImageRelationship: "Product UI surfaces should prove the claim instead of decorative cards.",
        layeringRules: ["Use layered product surfaces and clear content hierarchy.", "Avoid visual clutter that damages trust."],
        typeScaleRelationship: "Confident display type with strong body readability.",
        paletteDistribution: "Use polished business color with trustworthy contrast.",
        imageFraming: "Show checkout, dashboard, finance, or business workflow surfaces.",
        asymmetry: "Use controlled asymmetry around UI surfaces.",
        ctaPosture: "CTA should be conversion-oriented and business-clear.",
      },
    ],
    signatureMarkers: ["Product surfaces.", "Business credibility.", "Trust/security proof."],
    mustKeep: ["Keep product mechanics visible.", "Keep trust high."],
    mustAvoid: ["Do not use vague finance imagery.", "Do not over-decorate."],
    antiPatterns: ["Abstract money gradients.", "No checkout or billing concept."],
    failConditions: ["The page lacks product/payment surfaces.", "The business value is unclear."],
  },
  {
    slug: "linear",
    title: "Linear Productivity Tool",
    visualIntent:
      "A restrained productivity/developer tool lane with precise interface surfaces, calm hierarchy, and high signal density.",
    categories: ["productivity", "developer", "project management", "tool"],
    keywords: ["task", "tasks", "project", "issue", "roadmap", "tracker", "productivity", "workspace", "team"],
    styleKeywords: ["minimal", "precise", "developer", "calm"],
    compositionRecipes: [
      {
        id: "focused-tool",
        label: "Focused Tool",
        whenToUse: "Use for productivity tools, project management, issue tracking, and team workspaces.",
        heroStructure: "Build a focused product hero around one crisp workflow surface and a precise value statement.",
        sectionOrder: ["Focused workflow hero.", "Feature/product surface sections.", "Team workflow proof.", "Integration or speed section.", "Start CTA."],
        headlineImageRelationship: "Interface surface should be real and scannable, not decorative.",
        layeringRules: ["Use subtle depth, crisp panels, and restrained motion.", "Avoid loud marketing composition."],
        typeScaleRelationship: "Precise sans hierarchy with compact supporting metadata.",
        paletteDistribution: "Restrained neutral palette with controlled accent.",
        imageFraming: "Show actual task, issue, roadmap, or workspace surfaces.",
        asymmetry: "Keep asymmetry subtle and tool-like.",
        ctaPosture: "CTA should feel efficient and low-friction.",
      },
    ],
    signatureMarkers: ["Precise UI surfaces.", "Calm hierarchy.", "High signal density."],
    mustKeep: ["Keep workflow visible.", "Keep hierarchy restrained."],
    mustAvoid: ["Do not make it a loud generic SaaS page."],
    antiPatterns: ["Overdecorated dashboard mockup.", "No actual workflow."],
    failConditions: ["The tool surface is missing.", "The page reads like generic marketing."],
  },
];

const EXPLICIT_BUILD_PATTERNS = [
  /\b(build|create|make|generate|design|ship|scaffold)\b[\s\S]{0,80}\b(site|website|landing page|app|web app|page|component|dashboard|portfolio|store|shop)\b/i,
  /\b(site|website|landing page|web app|dashboard|portfolio|store|shop)\b[\s\S]{0,80}\b(for|about|called|that|with)\b/i,
];

const SELECTED_ELEMENT_PATTERN = /\buser selected element\b/i;
const ARTIFACT_PATTERN = /<cryzoArtifact\b/i;
const EDIT_INTENT_PATTERNS = [
  /\b(make this|change this|edit this|update this|rename|replace|remove|add a section|change the color|make it say)\b/i,
];

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function getMessageText(message: UIMessage): string {
  const partsText =
    message.parts
      ?.map((part) => {
        if (part.type === "text") return part.text;
        return "";
      })
      .join("\n") ?? "";

  const legacyContent =
    typeof (message as unknown as { content?: unknown }).content === "string"
      ? ((message as unknown as { content: string }).content)
      : "";

  return [partsText, legacyContent].filter(Boolean).join("\n").trim();
}

export function getConversationText(messages: UIMessage[]) {
  return messages.map(getMessageText).filter(Boolean).join("\n\n");
}

export function isBuildOrEditRequest(messages: UIMessage[]) {
  const conversationText = getConversationText(messages);
  const userText = messages
    .filter((message) => message.role === "user")
    .map(getMessageText)
    .join("\n\n");
  const hasSelectedElement = SELECTED_ELEMENT_PATTERN.test(conversationText);
  const hasPriorArtifact = ARTIFACT_PATTERN.test(conversationText);
  const hasEditIntent = EDIT_INTENT_PATTERNS.some((pattern) => pattern.test(userText));

  return (
    EXPLICIT_BUILD_PATTERNS.some((pattern) => pattern.test(userText)) ||
    hasSelectedElement ||
    (hasPriorArtifact && hasEditIntent)
  );
}

function scoreReference(reference: DesignReferenceProfile, prompt: string) {
  const normalizedPrompt = normalize(prompt);
  const matchedSignals: string[] = [];
  let score = 0;

  for (const keyword of reference.keywords) {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) continue;
    if (normalizedPrompt.includes(normalizedKeyword)) {
      score += normalizedKeyword.includes(" ") ? 12 : 8;
      matchedSignals.push(keyword);
    }
  }

  for (const category of reference.categories) {
    if (normalizedPrompt.includes(normalize(category))) {
      score += 6;
      matchedSignals.push(category);
    }
  }

  for (const style of reference.styleKeywords) {
    if (normalizedPrompt.includes(normalize(style))) {
      score += 4;
      matchedSignals.push(style);
    }
  }

  return { score, matchedSignals: unique(matchedSignals) };
}

export function routeDesignReferences(prompt: string): DesignRoutingResult {
  const ranked = REFERENCES.map((reference) => {
    const result = scoreReference(reference, prompt);
    return { reference, ...result };
  }).sort((a, b) => b.score - a.score || a.reference.slug.localeCompare(b.reference.slug));

  const best = ranked[0];
  const fallback =
    LOW_SIGNAL_FALLBACK_SLUGS.map((slug) => REFERENCES.find((reference) => reference.slug === slug)).find(Boolean) ??
    null;
  const primary = best && best.score >= MINIMUM_REFERENCE_SCORE ? best.reference : fallback;

  return {
    primary,
    score: best?.score ?? 0,
    matchedSignals: best?.matchedSignals ?? [],
    ranked: ranked.slice(0, 5).map((entry) => ({
      slug: entry.reference.slug,
      score: entry.score,
      matchedSignals: entry.matchedSignals,
    })),
  };
}

function formatBulletSection(title: string, items: string[]) {
  if (items.length === 0) return "";
  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export function buildDesignRecipePreamble(reference: DesignReferenceProfile) {
  const recipe = reference.compositionRecipes[0];

  return `
<design_recipe_system>
CRITICAL: Cryzo uses a canonical design recipe library for generated build output.
The locked recipe below is binding, not optional inspiration.
Do not generate generic AI landing-page structure unless the locked recipe explicitly asks for it.
Do not default to stock SaaS dashboards, purple-on-dark gradients, generic hero/features/testimonials/footer stacks, or interchangeable rounded feature cards.
Every major visual decision must follow the locked recipe first: composition, hero framing, type attitude, palette behavior, imagery, section rhythm, CTA posture, and acceptable weirdness or restraint.
</design_recipe_system>

<design_primary_lock slug="${reference.slug}">
Primary recipe: ${reference.title}
Visual intent: ${reference.visualIntent}
Selection behavior: use exactly this primary recipe for the build. Do not blend multiple design systems unless the user explicitly asks.
</design_primary_lock>

<design_execution_packet>
Locked composition recipe:
- Hero structure: ${recipe.heroStructure}
- Headline/image relationship: ${recipe.headlineImageRelationship}
- Type scale relationship: ${recipe.typeScaleRelationship}
- Palette distribution: ${recipe.paletteDistribution}
- Image framing: ${recipe.imageFraming}
- Asymmetry: ${recipe.asymmetry}
- CTA posture: ${recipe.ctaPosture}

${formatBulletSection("Section order:", recipe.sectionOrder)}

${formatBulletSection("Layering rules:", recipe.layeringRules)}

${formatBulletSection("Signature markers:", reference.signatureMarkers)}

${formatBulletSection("Must keep:", reference.mustKeep)}

${formatBulletSection("Must avoid:", reference.mustAvoid)}

${formatBulletSection("Anti-patterns:", reference.antiPatterns)}

${formatBulletSection("Anti-drift fail conditions:", reference.failConditions)}
</design_execution_packet>

<design_quality_gate>
Before finalizing code, mentally reject and revise the draft if it looks like generic AI slop: bland centered hero, safe gradients, stock card grids, vague copy, placeholder-heavy sections, or styling that could fit any industry.
The result should look recognizably native to the locked recipe while still being an original site for the user's prompt.
</design_quality_gate>
`.trim();
}
