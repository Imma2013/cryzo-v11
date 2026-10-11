import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Adapt V5's Vite glob loader to Next.js; all original design data stay in
// vendor/design-recipes, traced into the production API route.
const DESIGN_ROOT = join(process.cwd(), "vendor", "design-recipes");
const designDocumentModules: Record<string, string> = {};
const designReferenceModules: Record<string, DesignReferenceProfile> = {};
try {
  for (const entry of readdirSync(DESIGN_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const root = join(DESIGN_ROOT, slug);
    try {
      designDocumentModules[`vendor/design-recipes/${slug}/DESIGN.md`] = readFileSync(join(root, "DESIGN.md"), "utf8");
      designReferenceModules[`vendor/design-recipes/${slug}/REFERENCE.json`] = JSON.parse(readFileSync(join(root, "REFERENCE.json"), "utf8")) as DesignReferenceProfile;
    } catch (error) {
      console.warn(`[Cryzo design] Canonical reference ${slug} could not be loaded`, error);
    }
  }
} catch (error) {
  console.warn("[Cryzo design] Reference directory unavailable: using V5 fallback metadata", error);
}

export const CANONICAL_DESIGN_LIBRARY_PATH = 'vendor/design-recipes';
export type DesignReferenceSource = 'canonical' | 'fallback';

type DesignCategory =
  | 'ai'
  | 'automation'
  | 'automotive'
  | 'books'
  | 'collaboration'
  | 'consumer'
  | 'content'
  | 'creative'
  | 'crypto'
  | 'data'
  | 'database'
  | 'design'
  | 'developer'
  | 'docs'
  | 'email'
  | 'enterprise'
  | 'events'
  | 'fintech'
  | 'furniture'
  | 'hardware'
  | 'hospitality'
  | 'infra'
  | 'luxury'
  | 'media'
  | 'mobile'
  | 'monitoring'
  | 'payments'
  | 'productivity'
  | 'space'
  | 'support'
  | 'travel'
  | 'website-builder';

interface DesignReferenceMetadata {
  aliases?: string[];
  categories?: DesignCategory[];
  keywords?: string[];
  industries?: string[];
  productTypes?: string[];
  styleKeywords?: string[];
  negativeKeywords?: string[];
  audiences?: string[];
  pricePositions?: string[];
  interactionPatterns?: string[];
  supports3D?: boolean;
  supportsEditorial?: boolean;
  supportsMinimalShowcase?: boolean;
  compatibleSupports?: string[];
  family?: 'cryzo' | 'external';
}

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

export interface DesignExemplarCue {
  id: string;
  label: string;
  cues: string[];
}

export interface DesignReferenceProfile {
  slug: string;
  title: string;
  visualIntent: string;
  compositionRecipes: DesignCompositionRecipe[];
  headlineImageRelationships: string[];
  layeringRules: string[];
  typeSystemBehavior: string[];
  paletteBehavior: string[];
  sectionSkeletons: string[];
  antiPatterns: string[];
  allowedVariation: string[];
  exemplarCues: DesignExemplarCue[];
}

export interface DesignReferenceDoc {
  slug: string;
  relativePath: string;
  markdown: string;
  excerpt: string;
  source: DesignReferenceSource;
  profile: DesignReferenceProfile;
}

interface EnrichedDesignReferenceDoc extends DesignReferenceDoc {
  metadata: Required<DesignReferenceMetadata>;
  normalizedNames: string[];
}

type HouseDesignLane =
  | 'automotive-standard'
  | 'automotive-performance'
  | 'festival-world'
  | 'furniture-showcase'
  | 'immersive-spatial'
  | 'books-editorial'
  | 'travel-concierge'
  | 'dining-nightlife'
  | 'atmospheric-editorial'
  | 'pets';

const CATEGORY_KEYWORDS: Record<DesignCategory, string[]> = {
  ai: ['ai', 'artificial intelligence', 'llm', 'model', 'models', 'agent', 'agents', 'genai', 'prompt'],
  automation: ['automation', 'automate', 'workflow', 'workflows', 'integration', 'integrations', 'orchestration'],
  automotive: [
    'car',
    'cars',
    'auto',
    'automotive',
    'vehicle',
    'vehicles',
    'supercar',
    'sedan',
    'coupe',
    'ev',
    'electric vehicle',
  ],
  books: ['book', 'books', 'novel', 'novels', 'author', 'authors', 'publishing', 'publisher', 'library', 'bookstore'],
  collaboration: ['collaboration', 'whiteboard', 'canvas', 'team workspace', 'share', 'shared'],
  consumer: ['consumer', 'lifestyle', 'brand', 'shopping', 'retail', 'app for everyone'],
  content: ['content', 'cms', 'publishing', 'editorial', 'blog', 'knowledge base'],
  creative: ['creative', 'portfolio', 'visual', 'motion', 'video', 'brand world'],
  crypto: ['crypto', 'web3', 'blockchain', 'exchange', 'wallet', 'token'],
  data: ['data', 'analytics', 'warehouse', 'dashboard', 'metrics', 'insights'],
  database: ['database', 'db', 'postgres', 'storage', 'backend database'],
  design: ['design', 'prototype', 'prototyping', 'ui', 'ux', 'interface'],
  developer: [
    'developer',
    'developers',
    'devtool',
    'dev tool',
    'engineering',
    'code',
    'coding',
    'programmer',
    'programming',
    'api',
    'sdk',
  ],
  docs: ['docs', 'documentation', 'doc site', 'reference', 'guide', 'manual'],
  email: ['email', 'inbox', 'mail', 'newsletter'],
  enterprise: ['enterprise', 'b2b', 'corporate', 'business software', 'platform'],
  events: ['festival', 'event', 'events', 'lineup', 'tickets', 'concert', 'conference', 'weekend'],
  fintech: ['fintech', 'bank', 'banking', 'finance', 'financial', 'money', 'payments'],
  furniture: ['furniture', 'chair', 'chairs', 'sofa', 'sofas', 'table', 'tables', 'interior', 'home decor'],
  hardware: ['hardware', 'device', 'devices', 'phone', 'phones', 'smartphone', 'laptop', 'computer', 'tablet'],
  hospitality: ['hospitality', 'hotel', 'stay', 'host'],
  infra: ['infra', 'infrastructure', 'cloud', 'hosting', 'deploy', 'deployment', 'platform'],
  luxury: ['luxury', 'premium', 'high end', 'exclusive', 'prestige'],
  media: ['media', 'music', 'audio', 'streaming', 'entertainment'],
  mobile: ['mobile', 'ios', 'android', 'app store', 'native app', 'phone', 'phones', 'smartphone', 'smartphones'],
  monitoring: ['monitoring', 'observability', 'errors', 'logs', 'incident', 'performance'],
  payments: ['payments', 'checkout', 'billing', 'subscription', 'merchant'],
  productivity: ['productivity', 'workspace', 'tasks', 'project management', 'calendar', 'schedule', 'email client'],
  space: ['space', 'rocket', 'launch', 'satellite', 'aerospace', 'mission'],
  support: ['support', 'customer support', 'help desk', 'chat widget', 'service'],
  travel: ['travel', 'trip', 'booking', 'vacation', 'rental'],
  'website-builder': ['website builder', 'site builder', 'landing page builder', 'no-code website', 'web builder'],
};

const INDUSTRY_SIGNALS: Record<string, string[]> = {
  automotive: ['car', 'cars', 'auto', 'automotive', 'vehicle', 'vehicles', 'dealership', 'inventory'],
  'consumer-hardware': ['phone', 'phones', 'smartphone', 'device', 'devices', 'laptop', 'tablet', 'hardware'],
  books: ['book', 'books', 'novel', 'novels', 'author', 'publisher', 'publishing', 'library'],
  payments: ['payments', 'checkout', 'billing', 'merchant', 'invoice', 'subscription'],
  fintech: ['fintech', 'bank', 'banking', 'finance', 'financial', 'money'],
  crypto: ['crypto', 'exchange', 'wallet', 'token', 'blockchain', 'web3'],
  productivity: ['workspace', 'productivity', 'tasks', 'calendar', 'schedule', 'notes', 'wiki'],
  docs: ['docs', 'documentation', 'developer docs', 'api docs', 'guide', 'reference'],
  'developer-tools': ['developer', 'developers', 'coding', 'code', 'sdk', 'api', 'terminal', 'devtool', 'engineering'],
  'developer-infra': ['infra', 'infrastructure', 'database', 'backend', 'cloud', 'deploy', 'deployment', 'hosting'],
  ai: ['ai', 'artificial intelligence', 'model', 'models', 'agent', 'agents', 'llm', 'genai'],
  research: ['research', 'lab', 'labs', 'foundation model'],
  media: ['music', 'audio', 'video', 'streaming', 'entertainment'],
  design: ['design', 'prototype', 'prototyping', 'creative tool', 'ui tool'],
  collaboration: ['collaboration', 'whiteboard', 'team canvas', 'collaborative'],
  automation: ['automation', 'workflow', 'integrations', 'orchestration'],
  monitoring: ['monitoring', 'observability', 'errors', 'incident', 'performance'],
  travel: ['travel', 'trip', 'vacation', 'booking', 'rental'],
  mobility: ['rides', 'transport', 'mobility', 'delivery'],
  furniture: ['furniture', 'interior', 'home decor', 'chairs', 'tables', 'sofa', 'sofas'],
  content: ['cms', 'content', 'publishing', 'editorial'],
  events: ['festival', 'concert', 'lineup', 'tickets', 'event', 'conference'],
  analytics: ['analytics', 'metrics', 'insights', 'events'],
  space: ['space', 'rocket', 'mission', 'aerospace', 'satellite'],
  'brand-world': ['brand world', 'story world', 'immersive brand', 'editorial world'],
  commerce: ['store', 'selling', 'sales', 'shop', 'commerce', 'ecommerce', 'marketplace'],
};

const PRODUCT_TYPE_SIGNALS: Record<string, string[]> = {
  'car-commerce': ['car selling website', 'car sales', 'vehicle inventory', 'car inventory', 'dealer website', 'dealership'],
  'supercar-editorial': ['supercar', 'hypercar', 'motorsport', 'race inspired', 'exotic car'],
  'device-launch': ['phone website', 'smartphone launch', 'device launch', 'product keynote'],
  'device-commerce': ['phone store', 'sell phones', 'device store'],
  'festival-website': ['festival website', 'music festival', 'festival landing page', 'concert website', 'event lineup page'],
  'furniture-showcase': ['furniture website', 'furniture brand', 'interior design store', 'home decor website', 'designer furniture'],
  'book-editorial': ['book website', 'books website', 'author website', 'publishing house', 'library website', 'book publisher'],
  'payments-platform': ['payments platform', 'checkout platform', 'billing dashboard', 'merchant payments'],
  'banking-app': ['bank app', 'banking app', 'finance app', 'money app'],
  'crypto-exchange': ['crypto exchange', 'wallet app', 'trading app'],
  'documentation-site': ['documentation site', 'api docs', 'developer guides', 'docs site'],
  'issue-tracker': ['issue tracker', 'project tracker', 'roadmap tool'],
  'workspace-platform': ['workspace app', 'knowledge workspace', 'team workspace'],
  'website-builder': ['website builder', 'landing page builder', 'visual site builder'],
  'terminal-tool': ['terminal app', 'command line app'],
  'developer-platform': ['developer platform', 'deployment platform', 'backend platform'],
  'ai-lab': ['ai research company', 'model lab', 'foundation model company'],
  'ai-coding-tool': ['coding assistant', 'ai code editor', 'developer ai tool'],
  'voice-ai': ['voice ai', 'speech ai', 'text to speech'],
  'video-ai': ['video generation', 'ai video'],
  'travel-marketplace': ['travel marketplace', 'vacation booking'],
  'mobility-app': ['rideshare app', 'transport app', 'delivery app'],
  'observability-platform': ['error tracking platform', 'observability dashboard'],
  'database-platform': [
    'database platform',
    'developer database',
    'postgres backend platform',
    'postgres backend',
    'backend as a service',
    'app backend infra',
    'backend platform for app developers',
  ],
  'automation-platform': ['workflow automation', 'integration platform'],
  'spatial-world': ['3d landing page', 'spatial experience', 'immersive world'],
  'pet-brand': [
    'pet website',
    'pets website',
    'pet brand',
    'dog brand',
    'dogs brand',
    'cat brand',
    'cats brand',
    'dog lovers website',
    'veterinary website',
    'pet care brand',
  ],
  'pet-commerce': ['pet store', 'pets store', 'dog products', 'dogs products', 'cat products', 'cats products', 'pet ecommerce'],
  'travel-concierge': ['travel concierge', 'luxury travel advisor', 'curated journeys', 'bespoke travel'],
  'dining-nightlife': ['restaurant brand', 'nightlife brand', 'fine dining website', 'reservation website'],
};

const STYLE_SIGNALS: Record<string, string[]> = {
  minimal: ['minimal', 'clean', 'simple', 'restrained'],
  premium: ['premium', 'high-end', 'polished', 'refined'],
  luxury: ['luxury', 'exclusive', 'prestige', 'opulent'],
  editorial: ['editorial', 'magazine', 'storytelling'],
  cinematic: ['cinematic', 'dramatic', 'heroic'],
  technical: ['technical', 'developer-first', 'systemic'],
  playful: ['playful', 'friendly', 'fun'],
  futuristic: ['futuristic', 'sci-fi', 'next-gen'],
  spatial: ['3d', 'three.js', 'webgl', 'spatial', 'immersive', 'depth'],
  trustworthy: ['trustworthy', 'credible', 'serious'],
};

const HOUSE_LANE_SIGNALS: Record<HouseDesignLane, string[]> = {
  'automotive-standard': [
    'car website',
    'normal car website',
    'car brand',
    'premium automotive',
    'vehicle brand',
    'automotive brand',
    'car rental website',
    'classic automotive',
    'car landing page',
    'vehicle landing page',
  ],
  'automotive-performance': [
    'luxury car website',
    'luxury car',
    'racecar',
    'race car',
    'hypercar',
    'supercar',
    'performance car',
    'track car',
    'motorsport',
    'racing',
    'manifesto',
    'machine',
    'speed',
  ],
  'festival-world': [
    'festival website',
    'festival brand',
    'music festival',
    'concert website',
    'event website',
    'festival landing page',
    'lineup page',
    'tickets page',
  ],
  'furniture-showcase': [
    'furniture website',
    'furniture brand',
    'home decor website',
    'interior furniture',
    'designer furniture',
    'sofa brand',
    'chair brand',
  ],
  'immersive-spatial': [
    'immersive world',
    'spatial experience',
    '3d website',
    '3d landing page',
    'futuristic world',
    'artifact',
    'world building',
  ],
  'books-editorial': [
    'book website',
    'books website',
    'author website',
    'publishing house',
    'book publisher',
    'library website',
    'literary brand',
  ],
  'travel-concierge': [
    'travel concierge',
    'luxury travel',
    'curated journeys',
    'bespoke travel',
    'destination service',
  ],
  'dining-nightlife': [
    'fine dining',
    'restaurant website',
    'nightlife brand',
    'reservation website',
    'japanese dining',
  ],
  'atmospheric-editorial': ['atmospheric', 'calm luxury', 'editorial luxury', 'ambient story world'],
  pets: [
    'pet website',
    'pets website',
    'pet brand',
    'pets brand',
    'pet care',
    'pet wellness',
    'pet store',
    'pets store',
    'dog website',
    'dogs website',
    'dog brand',
    'dogs brand',
    'dog lovers website',
    'cat website',
    'cats website',
    'cat brand',
    'cats brand',
    'animal care',
    'animals care',
    'veterinary',
    'adoption',
  ],
};

const HOUSE_LANE_OWNERS: Record<HouseDesignLane, string[]> = {
  'automotive-standard': ['cryzo-4'],
  'automotive-performance': ['cryzo-9'],
  'festival-world': ['cryzo-1'],
  'furniture-showcase': ['cryzo-3'],
  'immersive-spatial': ['cryzo-2'],
  'books-editorial': ['cryzo-8'],
  'travel-concierge': ['cryzo-6'],
  'dining-nightlife': ['cryzo-7'],
  'atmospheric-editorial': ['cryzo-8'],
  pets: ['cryzo-10'],
};

const LOW_SIGNAL_FALLBACK_SLUGS = ['apple', 'notion', 'stripe', 'linear.app', 'airbnb', 'vercel'];
const MINIMUM_REFERENCE_SCORE = 110;
const REFERENCE_METADATA: Record<string, DesignReferenceMetadata> = {
  airbnb: {
    categories: ['consumer', 'hospitality', 'travel'],
    keywords: ['lodging', 'marketplace', 'stays'],
    industries: ['travel', 'commerce'],
    productTypes: ['travel-marketplace'],
    styleKeywords: ['premium', 'friendly'],
  },
  airtable: {
    categories: ['data', 'enterprise', 'productivity'],
    keywords: ['spreadsheet', 'database-like', 'grid', 'structured workflow', 'internal ops'],
    industries: ['productivity', 'enterprise', 'data'],
    styleKeywords: ['minimal', 'technical'],
    compatibleSupports: ['notion', 'miro', 'linear.app'],
  },
  apple: {
    categories: ['consumer', 'hardware', 'luxury', 'mobile'],
    keywords: ['iphone', 'phone', 'smartphone', 'consumer electronics', 'device launch', 'hardware keynote'],
    industries: ['consumer-hardware', 'commerce'],
    productTypes: ['device-launch', 'device-commerce'],
    styleKeywords: ['minimal', 'premium', 'cinematic'],
    negativeKeywords: ['car dealership', 'vehicle inventory'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['stripe', 'notion', 'figma'],
  },
  bmw: {
    categories: ['automotive', 'consumer', 'luxury'],
    keywords: ['driving', 'car launch', 'performance car'],
    industries: ['automotive', 'commerce'],
    productTypes: ['car-commerce'],
    styleKeywords: ['premium', 'technical'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['tesla', 'apple'],
  },
  cal: {
    aliases: ['cal.com'],
    categories: ['productivity'],
    keywords: ['calendar', 'booking', 'scheduling', 'appointment scheduling', 'booking links'],
    industries: ['productivity'],
    styleKeywords: ['minimal', 'friendly'],
    compatibleSupports: ['notion', 'superhuman', 'apple'],
  },
  claude: {
    categories: ['ai'],
    keywords: ['assistant', 'model company', 'research', 'ai assistant', 'research ai'],
    industries: ['ai', 'research'],
    productTypes: ['ai-lab'],
    styleKeywords: ['minimal', 'trustworthy'],
    compatibleSupports: ['notion', 'cursor', 'x.ai'],
  },
  clay: {
    categories: ['automation', 'enterprise'],
    keywords: ['go to market', 'sales tooling', 'sales automation', 'data enrichment'],
    industries: ['automation', 'enterprise'],
    styleKeywords: ['technical', 'premium'],
    compatibleSupports: ['airtable', 'zapier', 'notion'],
  },
  clickhouse: {
    categories: ['data', 'database', 'developer', 'enterprise'],
    keywords: ['analytics database', 'warehouse', 'data warehouse', 'high performance analytics'],
    industries: ['database', 'analytics', 'developer-infra'],
    productTypes: ['database-platform'],
    styleKeywords: ['technical', 'trustworthy'],
    compatibleSupports: ['mongodb', 'supabase', 'sentry'],
  },
  cohere: {
    categories: ['ai', 'enterprise'],
    keywords: ['language models', 'enterprise ai', 'enterprise model company', 'b2b ai platform'],
    industries: ['ai', 'enterprise'],
    productTypes: ['ai-lab'],
    styleKeywords: ['technical', 'trustworthy'],
    compatibleSupports: ['claude', 'mistral.ai', 'x.ai'],
  },
  coinbase: {
    categories: ['consumer', 'crypto', 'fintech'],
    keywords: ['exchange', 'wallet'],
    industries: ['crypto', 'fintech', 'commerce'],
    productTypes: ['crypto-exchange'],
    styleKeywords: ['trustworthy', 'premium'],
    compatibleSupports: ['stripe', 'revolut'],
  },
  composio: {
    categories: ['ai', 'automation', 'developer'],
    keywords: ['tool calling', 'integrations', 'agent integrations', 'tool orchestration'],
    industries: ['ai', 'automation', 'developer-tools'],
    productTypes: ['automation-platform'],
    styleKeywords: ['technical'],
    compatibleSupports: ['zapier', 'voltagent', 'cursor'],
  },
  'cryzo-1': {
    aliases: ['cryzo 1'],
    categories: ['creative', 'events', 'luxury'],
    keywords: ['festival website', 'festival brand', 'event world', 'concert landing page', 'lineup poster', 'editorial event'],
    industries: ['events', 'brand-world'],
    productTypes: ['festival-website'],
    styleKeywords: ['editorial', 'cinematic', 'premium'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['spotify', 'pinterest', 'figma'],
    family: 'cryzo',
  },
  'cryzo-2': {
    aliases: ['cryzo 2'],
    categories: ['creative', 'luxury'],
    keywords: ['3d', 'spatial', 'immersive', 'futuristic'],
    industries: ['3d', 'brand-world'],
    productTypes: ['spatial-world'],
    styleKeywords: ['spatial', 'cinematic', 'editorial', 'futuristic'],
    negativeKeywords: ['used car marketplace', 'vehicle inventory'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['apple', 'nvidia', 'x.ai'],
    family: 'cryzo',
  },
  'cryzo-3': {
    aliases: ['cryzo 3'],
    categories: ['creative', 'furniture', 'luxury'],
    keywords: ['furniture website', 'designer furniture', 'interior objects', 'home decor brand', 'soft showroom'],
    industries: ['furniture', 'brand-world', 'commerce'],
    productTypes: ['furniture-showcase'],
    styleKeywords: ['premium', 'cinematic', 'editorial'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['pinterest', 'apple', 'figma'],
    family: 'cryzo',
  },
  'cryzo-4': {
    aliases: ['cryzo 4'],
    categories: ['automotive', 'creative', 'luxury'],
    keywords: ['luxury car website', 'classic automotive', 'editorial automotive', 'car rental brand', 'premium vehicle'],
    industries: ['automotive', 'brand-world', 'commerce'],
    productTypes: ['car-commerce'],
    styleKeywords: ['editorial', 'premium', 'luxury', 'cinematic'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['ferrari', 'bmw', 'renault'],
    family: 'cryzo',
  },
  'cryzo-5': {
    aliases: ['cryzo 5'],
    categories: ['automotive', 'creative', 'luxury'],
    keywords: ['hypercar', 'performance machine', 'automotive manifesto', 'extreme performance', 'supercar launch'],
    industries: ['automotive', 'brand-world'],
    productTypes: ['supercar-editorial'],
    styleKeywords: ['editorial', 'cinematic', 'futuristic', 'luxury'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['lamborghini', 'ferrari', 'tesla'],
    family: 'cryzo',
  },
  'cryzo-6': {
    aliases: ['cryzo 6'],
    categories: ['creative', 'hospitality', 'luxury', 'travel'],
    keywords: ['travel concierge', 'luxury journeys', 'bespoke travel', 'destination service'],
    industries: ['travel', 'brand-world'],
    productTypes: ['travel-concierge', 'travel-marketplace'],
    styleKeywords: ['editorial', 'premium', 'luxury', 'cinematic'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['airbnb', 'uber', 'apple'],
    family: 'cryzo',
  },
  'cryzo-7': {
    aliases: ['cryzo 7'],
    categories: ['creative', 'hospitality', 'luxury'],
    keywords: ['fine dining', 'restaurant brand', 'nightlife', 'reservation website', 'premium hospitality'],
    industries: ['brand-world'],
    productTypes: ['dining-nightlife'],
    styleKeywords: ['editorial', 'luxury', 'cinematic'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['figma', 'apple', 'airbnb'],
    family: 'cryzo',
  },
  'cryzo-8': {
    aliases: ['cryzo 8'],
    categories: ['books', 'content', 'creative', 'luxury'],
    keywords: ['book website', 'publishing house', 'author website', 'literary brand', 'calm editorial', 'story world'],
    industries: ['books', 'content', 'brand-world'],
    productTypes: ['book-editorial'],
    styleKeywords: ['editorial', 'cinematic', 'premium'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['apple', 'notion', 'figma'],
    family: 'cryzo',
  },
  'cryzo-9': {
    aliases: ['cryzo 9'],
    categories: ['automotive', 'creative', 'luxury'],
    keywords: ['luxury car', 'racecar', 'race car', 'supercar', 'hypercar', 'motorsport', 'performance automotive'],
    industries: ['automotive', 'brand-world', 'luxury'],
    productTypes: ['supercar-editorial'],
    styleKeywords: ['editorial', 'futuristic', 'premium', 'luxury', 'cinematic'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['ferrari', 'lamborghini', 'tesla'],
    family: 'cryzo',
  },
  'cryzo-10': {
    aliases: ['cryzo 10'],
    categories: ['creative', 'design', 'luxury'],
    keywords: [
      'pet website',
      'pets website',
      'pet brand',
      'dog website',
      'dogs website',
      'dog brand',
      'dog lovers website',
      'cat website',
      'cat brand',
      'editorial agency',
      'fashion dog',
      'playful studio',
    ],
    industries: ['brand-world', 'design'],
    productTypes: ['pet-brand', 'pet-commerce'],
    styleKeywords: ['editorial', 'playful', 'premium'],
    supports3D: true,
    supportsEditorial: true,
    compatibleSupports: ['figma', 'framer', 'notion'],
    family: 'cryzo',
  },
  cursor: {
    categories: ['ai', 'developer'],
    keywords: ['coding assistant', 'editor', 'ai code editor', 'developer assistant'],
    industries: ['developer-tools', 'ai'],
    productTypes: ['ai-coding-tool'],
    styleKeywords: ['technical', 'minimal'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['raycast', 'warp', 'vercel'],
  },
  elevenlabs: {
    categories: ['ai', 'media'],
    keywords: ['voice', 'speech', 'audio', 'voice ai', 'speech generation', 'text to speech'],
    industries: ['media', 'ai'],
    productTypes: ['voice-ai'],
    styleKeywords: ['premium', 'technical'],
  },
  expo: {
    categories: ['developer', 'mobile'],
    keywords: ['react native', 'app tooling', 'cross-platform app', 'mobile app tooling'],
    industries: ['developer-tools'],
    styleKeywords: ['technical', 'friendly'],
  },
  ferrari: {
    categories: ['automotive', 'luxury'],
    keywords: ['supercar', 'racing', 'editorial automotive'],
    industries: ['automotive', 'luxury'],
    productTypes: ['supercar-editorial'],
    styleKeywords: ['editorial', 'luxury', 'cinematic'],
    negativeKeywords: ['used cars', 'vehicle inventory', 'marketplace', 'dealership app'],
    supportsEditorial: true,
    compatibleSupports: ['cryzo-2', 'apple'],
    family: 'external',
  },
  figma: {
    categories: ['collaboration', 'creative', 'design'],
    keywords: ['interface design', 'prototyping'],
    industries: ['design', 'collaboration'],
    styleKeywords: ['playful', 'premium'],
    compatibleSupports: ['framer', 'webflow', 'notion'],
  },
  framer: {
    categories: ['creative', 'design', 'website-builder'],
    keywords: ['motion', 'website design'],
    industries: ['design', 'website-builder'],
    productTypes: ['website-builder'],
    styleKeywords: ['premium', 'playful'],
    compatibleSupports: ['figma', 'vercel', 'apple'],
  },
  hashicorp: {
    categories: ['developer', 'enterprise', 'infra'],
    keywords: ['devops', 'platform tooling', 'terraform', 'ops platform', 'enterprise infrastructure'],
    industries: ['developer-infra'],
    styleKeywords: ['technical', 'trustworthy'],
    compatibleSupports: ['vercel', 'sentry', 'mongodb'],
  },
  ibm: {
    categories: ['enterprise'],
    keywords: ['corporate', 'institutional', 'enterprise platform', 'serious tech brand'],
    industries: ['enterprise'],
    styleKeywords: ['trustworthy', 'technical'],
  },
  intercom: {
    categories: ['enterprise', 'support'],
    keywords: ['customer messaging', 'support software'],
    industries: ['collaboration', 'commerce'],
    styleKeywords: ['friendly', 'trustworthy'],
    compatibleSupports: ['notion', 'stripe'],
  },
  kraken: {
    categories: ['crypto', 'fintech'],
    keywords: ['trading', 'exchange'],
    industries: ['crypto', 'fintech', 'commerce'],
    productTypes: ['crypto-exchange'],
    styleKeywords: ['trustworthy', 'technical'],
    compatibleSupports: ['stripe', 'coinbase'],
  },
  lamborghini: {
    categories: ['automotive', 'luxury'],
    keywords: ['supercar', 'concept vehicle', 'aggressive luxury automotive', 'exotic performance'],
    industries: ['automotive', 'luxury'],
    productTypes: ['supercar-editorial'],
    styleKeywords: ['editorial', 'luxury', 'futuristic'],
    compatibleSupports: ['ferrari', 'cryzo-9', 'tesla'],
  },
  'linear.app': {
    aliases: ['linear', 'linear app'],
    categories: ['developer', 'productivity'],
    keywords: ['issue tracker', 'project management'],
    industries: ['productivity', 'developer-tools'],
    productTypes: ['issue-tracker'],
    styleKeywords: ['minimal', 'premium', 'technical'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['notion', 'raycast', 'vercel'],
    family: 'external',
  },
  lovable: {
    categories: ['ai', 'creative', 'website-builder'],
    keywords: ['app builder', 'vibe coding', 'ai app builder', 'website generation'],
    industries: ['ai', 'website-builder'],
    productTypes: ['website-builder'],
    styleKeywords: ['playful', 'premium'],
  },
  minimax: {
    categories: ['ai', 'media'],
    keywords: ['video generation', 'multimodal', 'frontier ai lab', 'synthetic media'],
    industries: ['ai', 'media'],
    styleKeywords: ['futuristic', 'premium'],
  },
  mintlify: {
    categories: ['developer', 'docs'],
    keywords: ['documentation site', 'api docs'],
    industries: ['docs', 'developer-tools'],
    productTypes: ['documentation-site'],
    styleKeywords: ['minimal', 'technical'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['vercel', 'stripe', 'sanity'],
  },
  miro: {
    categories: ['collaboration', 'productivity'],
    keywords: ['whiteboard', 'team canvas', 'collaboration board', 'brainstorming workspace'],
    industries: ['collaboration', 'productivity'],
    styleKeywords: ['friendly', 'playful'],
  },
  'mistral.ai': {
    aliases: ['mistral', 'mistral ai'],
    categories: ['ai'],
    keywords: ['model lab', 'research company', 'frontier model company', 'open ai lab'],
    industries: ['ai', 'research'],
    productTypes: ['ai-lab'],
    styleKeywords: ['technical', 'futuristic'],
    compatibleSupports: ['cohere', 'x.ai', 'claude'],
  },
  mongodb: {
    categories: ['database', 'developer', 'enterprise'],
    keywords: ['document database', 'backend', 'developer database', 'database platform'],
    industries: ['developer-infra', 'database'],
    productTypes: ['database-platform'],
    styleKeywords: ['technical'],
  },
  notion: {
    categories: ['content', 'docs', 'productivity'],
    keywords: ['workspace', 'notes', 'knowledge'],
    industries: ['productivity', 'docs'],
    productTypes: ['workspace-platform'],
    styleKeywords: ['minimal', 'editorial'],
    supportsEditorial: true,
    supportsMinimalShowcase: true,
    compatibleSupports: ['linear.app', 'mintlify', 'apple'],
  },
  nvidia: {
    categories: ['ai', 'developer', 'hardware'],
    keywords: ['gpu', 'compute', 'chip'],
    industries: ['consumer-hardware', 'ai', 'developer-tools'],
    styleKeywords: ['technical', 'futuristic'],
    compatibleSupports: ['cryzo-2', 'apple', 'stripe'],
  },
  ollama: {
    categories: ['ai', 'developer'],
    keywords: ['local models', 'open source', 'local ai', 'on-device models'],
    industries: ['ai', 'developer-tools'],
    styleKeywords: ['technical', 'minimal'],
  },
  'opencode.ai': {
    aliases: ['opencode', 'opencode ai'],
    categories: ['ai', 'developer'],
    keywords: ['coding', 'agent tooling', 'developer ai tool', 'code generation'],
    industries: ['ai', 'developer-tools'],
    productTypes: ['ai-coding-tool'],
    styleKeywords: ['technical', 'premium'],
  },
  pinterest: {
    categories: ['consumer', 'creative'],
    keywords: ['inspiration', 'discovery', 'boards', 'visual discovery', 'curation'],
    industries: ['consumer', 'design'],
    styleKeywords: ['playful', 'editorial'],
  },
  posthog: {
    categories: ['data', 'developer'],
    keywords: ['product analytics', 'feature flags', 'event tracking', 'product insights'],
    industries: ['analytics', 'developer-tools'],
    styleKeywords: ['technical'],
    compatibleSupports: ['sentry', 'vercel', 'stripe'],
  },
  raycast: {
    categories: ['developer', 'productivity'],
    keywords: ['launcher', 'desktop productivity'],
    industries: ['developer-tools', 'productivity'],
    styleKeywords: ['minimal', 'premium'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['linear.app', 'warp', 'cursor'],
  },
  renault: {
    categories: ['automotive', 'consumer'],
    keywords: ['car brand', 'vehicle lineup', 'mainstream automotive', 'practical vehicle site'],
    industries: ['automotive', 'commerce'],
    productTypes: ['car-commerce'],
    styleKeywords: ['premium', 'trustworthy'],
  },
  replicate: {
    categories: ['ai', 'developer'],
    keywords: ['model marketplace', 'inference api', 'model inference platform', 'ai api'],
    industries: ['ai', 'developer-tools'],
    styleKeywords: ['technical'],
  },
  resend: {
    categories: ['developer', 'email'],
    keywords: ['transactional email', 'developer email'],
    industries: ['developer-tools', 'docs'],
    styleKeywords: ['minimal', 'technical'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['mintlify', 'stripe', 'vercel'],
  },
  revolut: {
    categories: ['consumer', 'fintech'],
    keywords: ['banking app', 'money app'],
    industries: ['fintech', 'commerce'],
    productTypes: ['banking-app'],
    styleKeywords: ['premium', 'trustworthy'],
    compatibleSupports: ['stripe', 'wise'],
  },
  runwayml: {
    aliases: ['runway', 'runway ml'],
    categories: ['ai', 'creative', 'media'],
    keywords: ['video generation', 'film', 'creative ai', 'media production ai'],
    industries: ['media', 'ai'],
    productTypes: ['video-ai'],
    styleKeywords: ['cinematic', 'premium'],
  },
  sanity: {
    categories: ['content', 'developer', 'docs', 'enterprise'],
    keywords: ['cms', 'structured content', 'content platform', 'composable publishing'],
    industries: ['content', 'docs', 'developer-tools'],
    styleKeywords: ['technical', 'minimal'],
  },
  sentry: {
    categories: ['developer', 'monitoring'],
    keywords: ['error tracking', 'observability'],
    industries: ['monitoring', 'developer-tools'],
    productTypes: ['observability-platform'],
    styleKeywords: ['technical'],
    compatibleSupports: ['posthog', 'vercel', 'hashicorp'],
  },
  spacex: {
    categories: ['space'],
    keywords: ['rocket', 'aerospace', 'mission', 'space tech', 'launch company'],
    industries: ['space'],
    styleKeywords: ['cinematic', 'technical'],
  },
  spotify: {
    categories: ['consumer', 'media'],
    keywords: ['music streaming', 'audio platform', 'streaming app', 'music platform'],
    industries: ['media', 'consumer'],
    styleKeywords: ['playful', 'premium'],
  },
  stripe: {
    categories: ['developer', 'fintech', 'payments'],
    keywords: ['checkout', 'billing', 'payment infrastructure'],
    industries: ['payments', 'fintech', 'developer-tools'],
    productTypes: ['payments-platform'],
    styleKeywords: ['premium', 'technical'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['vercel', 'apple', 'mintlify'],
    family: 'external',
  },
  supabase: {
    categories: ['database', 'developer', 'infra'],
    keywords: ['backend as a service', 'postgres', 'developer backend', 'app backend infra'],
    industries: ['database', 'developer-infra'],
    productTypes: ['database-platform'],
    styleKeywords: ['technical', 'minimal'],
    compatibleSupports: ['vercel', 'stripe', 'mintlify'],
  },
  superhuman: {
    categories: ['email', 'luxury', 'productivity'],
    keywords: ['premium inbox', 'email client', 'elite workflow software', 'fast email'],
    industries: ['productivity', 'email'],
    styleKeywords: ['premium', 'minimal'],
  },
  tesla: {
    categories: ['automotive', 'consumer', 'hardware', 'luxury'],
    keywords: ['electric vehicle', 'ev', 'tech brand'],
    industries: ['automotive', 'commerce'],
    productTypes: ['car-commerce'],
    styleKeywords: ['minimal', 'premium', 'futuristic'],
    negativeKeywords: ['used cars', 'classified marketplace'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['bmw', 'apple', 'nvidia'],
    family: 'external',
  },
  'together.ai': {
    aliases: ['together', 'together ai'],
    categories: ['ai', 'developer'],
    keywords: ['inference platform', 'model serving', 'open model infra', 'ai inference'],
    industries: ['ai', 'developer-tools'],
    styleKeywords: ['technical'],
  },
  uber: {
    categories: ['consumer', 'travel'],
    keywords: ['mobility', 'transportation', 'rides', 'delivery', 'urban movement'],
    industries: ['mobility', 'consumer'],
    productTypes: ['mobility-app'],
    styleKeywords: ['technical', 'premium'],
  },
  vercel: {
    categories: ['developer', 'infra', 'website-builder'],
    keywords: ['frontend cloud', 'deployment platform'],
    industries: ['developer-infra', 'developer-tools'],
    productTypes: ['developer-platform', 'website-builder'],
    styleKeywords: ['minimal', 'technical', 'premium'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['stripe', 'mintlify', 'raycast'],
    family: 'external',
  },
  voltagent: {
    categories: ['ai', 'developer'],
    keywords: ['agent framework', 'agent tooling', 'ai developer infrastructure', 'agent platform'],
    industries: ['ai', 'developer-tools'],
    styleKeywords: ['technical'],
  },
  warp: {
    categories: ['developer', 'productivity'],
    keywords: ['terminal', 'command line'],
    industries: ['developer-tools', 'productivity'],
    productTypes: ['terminal-tool'],
    styleKeywords: ['technical', 'minimal'],
    supportsMinimalShowcase: true,
    compatibleSupports: ['raycast', 'cursor', 'vercel'],
  },
  webflow: {
    categories: ['creative', 'design', 'website-builder'],
    keywords: ['site builder', 'no-code', 'visual web publishing', 'website builder'],
    industries: ['website-builder', 'design'],
    productTypes: ['website-builder'],
    styleKeywords: ['premium', 'creative'],
  },
  wise: {
    categories: ['consumer', 'fintech'],
    keywords: ['money transfer', 'global payments'],
    industries: ['fintech', 'commerce'],
    productTypes: ['banking-app'],
    styleKeywords: ['trustworthy', 'minimal'],
    compatibleSupports: ['stripe', 'revolut'],
  },
  'x.ai': {
    aliases: ['xai', 'x ai', 'x.ai'],
    categories: ['ai'],
    keywords: ['research lab', 'model company', 'frontier ai lab', 'research-heavy ai brand'],
    industries: ['ai', 'research'],
    productTypes: ['ai-lab'],
    styleKeywords: ['technical', 'futuristic'],
  },
  zapier: {
    categories: ['automation', 'productivity'],
    keywords: ['workflow automation', 'integrations', 'no-code automation', 'automation platform'],
    industries: ['automation', 'productivity'],
    productTypes: ['automation-platform'],
    styleKeywords: ['friendly', 'technical'],
  },
};

function createExcerpt(markdown: string) {
  return markdown
    .trim()
    .split('\n')
    .slice(0, 140)
    .join('\n')
    .trim();
}

function createFallbackDesignProfile(slug: string, metadata: Required<DesignReferenceMetadata>, markdown: string): DesignReferenceProfile {
  const firstMeaningfulLine =
    markdown
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#')) ?? `${slug} reference`;

  return {
    slug,
    title: slug,
    visualIntent: firstMeaningfulLine,
    compositionRecipes: [
      {
        id: 'fallback',
        label: `${slug} fallback`,
        whenToUse: `Fallback recipe for ${slug} when canonical structured metadata is unavailable.`,
        heroStructure:
          metadata.supportsEditorial
            ? 'Use a chapter-like, image-led hero that stays visibly reference-native and avoids generic startup symmetry.'
            : 'Use a category-correct hero anchored by one dominant focal moment.',
        sectionOrder: [
          'Primary reference-native hero',
          'Reference-native capability or narrative section',
          'Supporting showcase section',
          'Reference-native close',
        ],
        headlineImageRelationship: metadata.supportsEditorial
          ? 'Keep headline and hero image tightly coupled or overlapping when useful.'
          : 'Keep headline and hero image structurally tied rather than disconnected.',
        layeringRules: ['Keep layering purposeful and reference-led.', 'Avoid generic decorative overlap.'],
        typeScaleRelationship: metadata.supportsEditorial
          ? 'Use visible scale tension and chapter rhythm.'
          : 'Use disciplined hierarchy native to the product category.',
        paletteDistribution: 'Keep palette behavior aligned to the selected reference family instead of generic defaults.',
        imageFraming: 'Treat imagery as part of the design system rather than decorative filler.',
        asymmetry: metadata.supportsEditorial
          ? 'Allow asymmetry when it preserves reference tension.'
          : 'Keep asymmetry restrained and category-correct.',
        ctaPosture: 'Keep CTA styling native to the selected reference.',
      },
    ],
    headlineImageRelationships: [
      metadata.supportsEditorial
        ? 'Allow overlap or close adjacency between headline and hero imagery.'
        : 'Keep headline and hero imagery structurally connected.',
    ],
    layeringRules: ['Keep the composition reference-led.', 'Avoid generic startup layering patterns.'],
    typeSystemBehavior: [
      metadata.supportsEditorial
        ? 'Use editorial scale contrast.'
        : 'Use restrained type hierarchy that fits the selected category.',
    ],
    paletteBehavior: ['Use palette behavior native to the selected reference family.'],
    sectionSkeletons: [
      'Reference-native hero',
      'Reference-native proof or narrative section',
      'Supporting showcase section',
      'Reference-native close',
    ],
    antiPatterns: [
      'generic AI-generated landing-page structure',
      'hero/features/testimonials/footer normalization',
    ],
    allowedVariation: ['Vary content and copy, but keep the composition recognizably native to the selected reference.'],
    exemplarCues: [
      {
        id: 'fallback-default',
        label: 'Fallback reference cue',
        cues: ['Preserve one dominant focal moment.', 'Avoid generic startup-safe composition.'],
      },
    ],
  };
}

function formatReferenceName(slug: string) {
  if (slug === 'linear.app') {
    return 'Linear';
  }

  if (slug === 'x.ai') {
    return 'xAI';
  }

  if (slug === 'mistral.ai') {
    return 'Mistral AI';
  }

  if (slug === 'opencode.ai') {
    return 'OpenCode AI';
  }

  if (slug === 'together.ai') {
    return 'Together AI';
  }

  return slug
    .split(/[.-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const FALLBACK_REFERENCE_SUMMARIES: Record<string, string> = {
  apple:
    'Apple is the minimal consumer-hardware keynote lane. Use dominant product imagery, calm chrome, oversized hierarchy, and quiet premium restraint. Avoid dashboards, dark SaaS gradients, and automotive drift.',
  stripe:
    'Stripe is the developer-fintech infrastructure lane. Use structured explanation, precise hierarchy, modular product storytelling, and technical polish. Avoid generic AI gradients or lifestyle-led composition.',
  vercel:
    'Vercel is the minimal developer-platform lane. Use severe restraint, crisp spacing, sharp hierarchy, and product-led clarity. Avoid consumer softness and overillustrated hero sections.',
  notion:
    'Notion is the calm workspace-editorial lane. Use document rhythm, quiet utility, modular content blocks, and typography-led clarity. Avoid flashy gradients or loud marketing theatrics.',
  figma:
    'Figma is the playful collaborative-design-tool lane. Use modular product demos, bright clarity, creative energy, and collaborative surfaces. Avoid dry docs-site minimalism or corporate stiffness.',
  airbnb:
    'Airbnb is the warm travel-marketplace lane. Use destination-led imagery, inviting browsing, soft utility, and human-centered discovery. Avoid hard enterprise tone or developer-platform styling.',
  sentry:
    'Sentry is the technical observability lane. Use dark precision, issue framing, code-adjacent UI, and signal-rich hierarchy. Avoid friendly consumer softness or luxury editorial drift.',
  warp:
    'Warp is the premium terminal-tool lane. Use compact utility, technical sharpness, command surfaces, and workflow speed. Avoid consumer-marketplace patterns or oversized generic marketing.',
  'linear.app':
    'Linear is the premium product-work lane. Use surgical hierarchy, minimal surfaces, velocity-oriented product clarity, and compact sections. Avoid bubbly consumer styling or generic AI hero layouts.',
  supabase:
    'Supabase is the developer database-platform lane. Use open-source confidence, technical clarity, structured platform storytelling, and calm modern infra aesthetics. Avoid unrelated luxury or generic AI abstraction.',
  'cryzo-1':
    'Cryzo 1 is the cinematic festival-world lane. Use poster-scale typography, immersive atmosphere, lineup hierarchy, and event-world composition. Avoid plain conference-site grids.',
  'cryzo-2':
    'Cryzo 2 is the spatial 3D world lane. Use one dominant object, atmospheric depth, oversized editorial type, and true or convincingly simulated 3D presence. Avoid flat dark SaaS pages or car-launch drift.',
  'cryzo-3':
    'Cryzo 3 is the tactile furniture-showcase lane. Use curated showroom composition, warm-neutral luxury, object-led framing, and editorial pacing. Avoid generic ecommerce grids.',
  'cryzo-4':
    'Cryzo 4 is the restrained editorial automotive lane. Use dominant vehicle imagery, condensed display typography, muted premium contrast, and curated automotive storytelling. Avoid hypercar theatrics and AI-homepage drift.',
  'cryzo-5':
    'Cryzo 5 is the performance-machine manifesto lane. Use brutal type, cinematic speed, heat-toned accents, and machine reverence. Avoid tidy brochure patterns or normal feature-card marketing.',
  'cryzo-6':
    'Cryzo 6 is the concierge travel lane. Use destination atmosphere, elegant serif type, guided service clarity, and warm-luxury restraint. Avoid OTA booking-engine layouts or startup-card aesthetics.',
  'cryzo-7':
    'Cryzo 7 is the dining-nightlife lane. Use moody contrast, scene-first composition, refined editorial pacing, and premium hospitality drama. Avoid generic restaurant templates.',
  'cryzo-8':
    'Cryzo 8 is the books-editorial lane. Use contemplative rhythm, literary typography, chaptered sections, and atmospheric storytelling. Avoid generic content grids or SaaS product marketing.',
  'cryzo-9':
    'Cryzo 9 is the luxury-performance automotive lane. Use dominant machine imagery, cinematic framing, sharp contrast, and prestige-speed tension. Avoid dealership grids or developer-tool drift.',
  'cryzo-10':
    'Cryzo 10 is the playful-editorial pet lane. Use character-led composition, premium art direction, surprising typography, and styled commerce blocks. Avoid childish pet-store templates or sterile minimalism.',
};

function createFallbackDesignMarkdown(slug: string, metadata: Required<DesignReferenceMetadata>) {
  const name = formatReferenceName(slug);
  const specialSummary = FALLBACK_REFERENCE_SUMMARIES[slug];
  const capabilities = [
    metadata.supports3D ? 'Supports spatial or 3D-led composition.' : '',
    metadata.supportsEditorial ? 'Supports editorial pacing and chaptered storytelling.' : '',
    metadata.supportsMinimalShowcase ? 'Supports restrained product-showcase minimalism.' : '',
  ].filter(Boolean);
  const compatibleSupports = metadata.compatibleSupports.length > 0 ? metadata.compatibleSupports.join(', ') : 'none';
  const negativeKeywords = metadata.negativeKeywords.length > 0 ? metadata.negativeKeywords.join(', ') : 'generic template output';

  return `# ${name}

## Identity
${specialSummary ?? `${name} is a ${metadata.styleKeywords.join(', ') || 'category-correct'} reference system for ${metadata.productTypes.join(', ') || metadata.categories.join(', ') || 'its domain'}.`}

## Routing Metadata
- Family: ${metadata.family}
- Categories: ${metadata.categories.join(', ') || 'not specified'}
- Industries: ${metadata.industries.join(', ') || 'not specified'}
- Product types: ${metadata.productTypes.join(', ') || 'not specified'}
- Style keywords: ${metadata.styleKeywords.join(', ') || 'not specified'}

## Capabilities
${capabilities.length > 0 ? capabilities.map((capability) => `- ${capability}`).join('\n') : '- No special capability flags are defined.'}

## Compatible Supports
- ${compatibleSupports}

## Avoid
- ${negativeKeywords}
- generic AI slop, default Bolt premium layouts, or unrelated brand drift

## Fallback Note
- This fallback profile was generated from routing metadata because the canonical DESIGN.md file for ${slug} was unavailable at runtime.
- Treat the selected slug as binding guidance even in fallback mode.
`;
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizeToken(token: string) {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('ses') && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

function canonicalizeWords(text: string) {
  return normalizeText(text)
    .split(' ')
    .filter(Boolean)
    .map(singularizeToken)
    .join(' ');
}

function tokenize(text: string) {
  return Array.from(new Set(normalizeText(text).split(' ').filter((token) => token.length >= 2)));
}

function includesPhrase(haystack: string, needle: string) {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedNeedle = normalizeText(needle);
  const canonicalHaystack = canonicalizeWords(haystack);
  const canonicalNeedle = canonicalizeWords(needle);

  if (!normalizedHaystack || !normalizedNeedle) {
    return false;
  }

  return (
    ` ${normalizedHaystack} `.includes(` ${normalizedNeedle} `) ||
    ` ${canonicalHaystack} `.includes(` ${canonicalNeedle} `)
  );
}

function countKeywordMatches(normalizedPrompt: string, keywords: string[]) {
  return keywords.reduce((count, keyword) => count + (includesPhrase(normalizedPrompt, keyword) ? 1 : 0), 0);
}

function inferPromptCategories(normalizedPrompt: string) {
  const categoryMatches = new Map<DesignCategory, number>();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [DesignCategory, string[]][]) {
    const matches = countKeywordMatches(normalizedPrompt, keywords);

    if (matches > 0) {
      categoryMatches.set(category, matches);
    }
  }

  return categoryMatches;
}

function inferSignalMatches(normalizedPrompt: string, signals: Record<string, string[]>) {
  const signalMatches = new Map<string, number>();

  for (const [signal, keywords] of Object.entries(signals)) {
    const matches = countKeywordMatches(normalizedPrompt, keywords);

    if (matches > 0) {
      signalMatches.set(signal, matches);
    }
  }

  return signalMatches;
}

function getReferenceMetadata(slug: string): Required<DesignReferenceMetadata> {
  const metadata = REFERENCE_METADATA[slug] ?? {};

  return {
    aliases: metadata.aliases ?? [],
    categories: metadata.categories ?? [],
    keywords: metadata.keywords ?? [],
    industries: metadata.industries ?? [],
    productTypes: metadata.productTypes ?? [],
    styleKeywords: metadata.styleKeywords ?? [],
    negativeKeywords: metadata.negativeKeywords ?? [],
    audiences: metadata.audiences ?? [],
    pricePositions: metadata.pricePositions ?? [],
    interactionPatterns: metadata.interactionPatterns ?? [],
    supports3D: metadata.supports3D ?? false,
    supportsEditorial: metadata.supportsEditorial ?? false,
    supportsMinimalShowcase: metadata.supportsMinimalShowcase ?? false,
    compatibleSupports: metadata.compatibleSupports ?? [],
    family: metadata.family ?? (slug.startsWith('cryzo-') ? 'cryzo' : 'external'),
  };
}

const canonicalDesignDocsBySlug = new Map(
  Object.entries(designDocumentModules).map(([modulePath, markdown]) => {
    const segments = modulePath.split('/');
    const slug = segments[segments.length - 2];
    return [slug, markdown.trim()] as const;
  }),
);
const canonicalDesignProfilesBySlug = new Map(
  Object.entries(designReferenceModules).map(([modulePath, profile]) => {
    const segments = modulePath.split('/');
    const slug = segments[segments.length - 2];
    return [slug, profile] as const;
  }),
);

const designReferenceLibrary: EnrichedDesignReferenceDoc[] = Array.from(
  new Set([...Object.keys(REFERENCE_METADATA), ...canonicalDesignDocsBySlug.keys(), ...canonicalDesignProfilesBySlug.keys()]),
)
  .sort((left, right) => left.localeCompare(right))
  .map((slug) => {
    const metadata = getReferenceMetadata(slug);
    const normalizedNames = Array.from(new Set([slug, ...metadata.aliases].map((value) => normalizeText(value))));
    const canonicalMarkdown = canonicalDesignDocsBySlug.get(slug);
    const canonicalProfile = canonicalDesignProfilesBySlug.get(slug);
    const source: DesignReferenceSource = canonicalMarkdown && canonicalProfile ? 'canonical' : 'fallback';
    const markdown = canonicalMarkdown ?? createFallbackDesignMarkdown(slug, metadata);
    const profile = canonicalProfile ?? createFallbackDesignProfile(slug, metadata, markdown);

    return {
      slug,
      relativePath: `${CANONICAL_DESIGN_LIBRARY_PATH}/${slug}/DESIGN.md`,
      markdown,
      excerpt: createExcerpt(markdown),
      profile,
      metadata,
      normalizedNames,
      source,
    };
  });

export function getDesignReferenceLibrary(): DesignReferenceDoc[] {
  return designReferenceLibrary;
}

export function getDesignLibraryDiagnostics() {
  const canonical = designReferenceLibrary.filter((reference) => reference.source === 'canonical');
  const fallback = designReferenceLibrary.filter((reference) => reference.source === 'fallback');
  const missingCanonicalProfileSlugs = designReferenceLibrary
    .filter((reference) => !canonicalDesignProfilesBySlug.has(reference.slug))
    .map((reference) => reference.slug);

  return {
    canonicalCount: canonical.length,
    fallbackCount: fallback.length,
    profileCount: canonicalDesignProfilesBySlug.size,
    supportedSlugs: designReferenceLibrary.map((reference) => reference.slug),
    missingCanonicalSlugs: fallback.map((reference) => reference.slug),
    missingCanonicalProfileSlugs,
  };
}

interface RankedDesignReference {
  reference: EnrichedDesignReferenceDoc;
  score: number;
  reasons: string[];
}

export interface DesignReferenceRoutingResult {
  primary: DesignReferenceDoc | undefined;
  supporting: DesignReferenceDoc[];
  selectionSource?: DesignReferenceSource;
  matchedCategories: string[];
  matchedSignals: string[];
  ranked: Array<{
    slug: string;
    score: number;
    reasons: string[];
  }>;
}

function scoreSignalMatches(
  signalMatches: Map<string, number>,
  candidateSignals: string[],
  baseWeight: number,
  reasons: string[],
  reasonPrefix: string,
) {
  let score = 0;

  for (const signal of candidateSignals) {
    const matches = signalMatches.get(signal);

    if (matches) {
      score += baseWeight + matches * Math.ceil(baseWeight / 8);
      reasons.push(`${reasonPrefix}:${signal}`);
    }
  }

  return score;
}

function scoreReference(reference: EnrichedDesignReferenceDoc, normalizedPrompt: string, promptTokens: string[]) {
  let score = 0;
  const reasons: string[] = [];
  const promptCategories = inferPromptCategories(normalizedPrompt);
  const industrySignals = inferSignalMatches(normalizedPrompt, INDUSTRY_SIGNALS);
  const productTypeSignals = inferSignalMatches(normalizedPrompt, PRODUCT_TYPE_SIGNALS);
  const styleSignals = inferSignalMatches(normalizedPrompt, STYLE_SIGNALS);

  for (const name of reference.normalizedNames) {
    if (name && includesPhrase(normalizedPrompt, name)) {
      score += 1000;
      reasons.push(`explicit:${name}`);
    }
  }

  const slugTokens = tokenize(reference.slug);

  for (const token of slugTokens) {
    if (promptTokens.includes(token)) {
      score += 10;
      reasons.push(`slug:${token}`);
    }
  }

  const matchedCategories = reference.metadata.categories.filter((category) => promptCategories.has(category));

  for (const category of matchedCategories) {
    score += 18 + (promptCategories.get(category) ?? 0) * 4;
    reasons.push(`category:${category}`);
  }

  if (promptCategories.size > 0 && matchedCategories.length === 0 && reference.metadata.categories.length > 0) {
    score -= 14;
  }

  score += scoreSignalMatches(industrySignals, reference.metadata.industries, 72, reasons, 'industry');
  score += scoreSignalMatches(productTypeSignals, reference.metadata.productTypes, 64, reasons, 'product');
  score += scoreSignalMatches(styleSignals, reference.metadata.styleKeywords, 28, reasons, 'style');

  const keywordMatches = countKeywordMatches(normalizedPrompt, [
    ...reference.metadata.keywords,
    ...reference.metadata.productTypes,
  ]);

  if (keywordMatches > 0) {
    score += keywordMatches * 12;
    reasons.push(`keywords:${keywordMatches}`);
  }

  const negativeMatches = countKeywordMatches(normalizedPrompt, reference.metadata.negativeKeywords);

  if (negativeMatches > 0) {
    score -= negativeMatches * 120;
    reasons.push(`negative:${negativeMatches}`);
  }

  const searchableText = normalizeText(`${reference.slug} ${reference.markdown.slice(0, 4000)}`);
  let overlapCount = 0;

  for (const token of promptTokens) {
    if (token.length >= 4 && searchableText.includes(token)) {
      overlapCount += 1;
    }
  }

  score += Math.min(overlapCount, 8);

  if (styleSignals.has('spatial') && reference.metadata.supports3D) {
    score += 48;
    reasons.push('capability:3d');
  }

  if (styleSignals.has('editorial') && reference.metadata.supportsEditorial) {
    score += 22;
    reasons.push('capability:editorial');
  }

  if (styleSignals.has('minimal') && reference.metadata.supportsMinimalShowcase) {
    score += 18;
    reasons.push('capability:minimal');
  }

  if (industrySignals.has('automotive') && !reference.metadata.industries.includes('automotive')) {
    score -= 40;
  }

  if (industrySignals.has('consumer-hardware') && !reference.metadata.industries.includes('consumer-hardware')) {
    score -= 36;
  }

  if (industrySignals.has('payments') && !reference.metadata.industries.includes('payments')) {
    score -= 28;
  }

  if (promptCategories.has('database') && !reference.metadata.categories.includes('database')) {
    score -= 36;
  }

  if (industrySignals.has('docs') && !reference.metadata.industries.includes('docs')) {
    score -= 24;
  }

  if (industrySignals.has('books') && !reference.metadata.industries.includes('books')) {
    score -= 28;
  }

  if (industrySignals.has('furniture') && !reference.metadata.industries.includes('furniture')) {
    score -= 28;
  }

  if (industrySignals.has('events') && !reference.metadata.industries.includes('events')) {
    score -= 28;
  }

  if (industrySignals.has('monitoring') && !reference.metadata.industries.includes('monitoring')) {
    score -= 24;
  }

  if (industrySignals.has('space') && !reference.metadata.categories.includes('space')) {
    score -= 24;
  }

  if (productTypeSignals.has('database-platform') && !reference.metadata.productTypes.includes('database-platform')) {
    score -= 40;
  }

  return { score, reasons };
}

function inferHouseLaneMatches(normalizedPrompt: string) {
  const laneMatches = new Map<HouseDesignLane, number>();

  for (const [lane, keywords] of Object.entries(HOUSE_LANE_SIGNALS) as [HouseDesignLane, string[]][]) {
    const matches = countKeywordMatches(normalizedPrompt, keywords);

    if (matches > 0) {
      laneMatches.set(lane, matches);
    }
  }

  if (
    !laneMatches.has('festival-world') &&
    (includesPhrase(normalizedPrompt, 'festival') ||
      includesPhrase(normalizedPrompt, 'concert') ||
      includesPhrase(normalizedPrompt, 'lineup') ||
      includesPhrase(normalizedPrompt, 'tickets') ||
      includesPhrase(normalizedPrompt, 'event website'))
  ) {
    laneMatches.set('festival-world', 1);
  }

  if (
    !laneMatches.has('furniture-showcase') &&
    (includesPhrase(normalizedPrompt, 'furniture') ||
      includesPhrase(normalizedPrompt, 'chair') ||
      includesPhrase(normalizedPrompt, 'sofa') ||
      includesPhrase(normalizedPrompt, 'table') ||
      includesPhrase(normalizedPrompt, 'home decor'))
  ) {
    laneMatches.set('furniture-showcase', 1);
  }

  if (
    !laneMatches.has('books-editorial') &&
    (includesPhrase(normalizedPrompt, 'book') ||
      includesPhrase(normalizedPrompt, 'books') ||
      includesPhrase(normalizedPrompt, 'author') ||
      includesPhrase(normalizedPrompt, 'publisher') ||
      includesPhrase(normalizedPrompt, 'publishing') ||
      includesPhrase(normalizedPrompt, 'library'))
  ) {
    laneMatches.set('books-editorial', 1);
  }

  if (
    !laneMatches.has('automotive-performance') &&
    (includesPhrase(normalizedPrompt, 'hypercar') ||
      includesPhrase(normalizedPrompt, 'supercar') ||
      includesPhrase(normalizedPrompt, 'luxury car') ||
      includesPhrase(normalizedPrompt, 'racecar') ||
      includesPhrase(normalizedPrompt, 'race car'))
  ) {
    laneMatches.set('automotive-performance', 1);
  }

  if (
    !laneMatches.has('automotive-standard') &&
    !laneMatches.has('automotive-performance') &&
    (includesPhrase(normalizedPrompt, 'car') ||
      includesPhrase(normalizedPrompt, 'vehicle') ||
      includesPhrase(normalizedPrompt, 'automotive'))
  ) {
    laneMatches.set('automotive-standard', 1);
  }

  if (
    !laneMatches.has('pets') &&
    (includesPhrase(normalizedPrompt, 'pet') ||
      includesPhrase(normalizedPrompt, 'dog') ||
      includesPhrase(normalizedPrompt, 'cat') ||
      includesPhrase(normalizedPrompt, 'animal'))
  ) {
    laneMatches.set('pets', 1);
  }

  return laneMatches;
}

function hasExplicitStyleIntent(normalizedPrompt: string, name: string) {
  const stylePrefixes = [
    'use',
    'with',
    'like',
    'inspired by',
    'styled like',
    'style of',
    'design language',
    'look like',
    'based on',
  ];

  return stylePrefixes.some((prefix) => includesPhrase(normalizedPrompt, `${prefix} ${name}`));
}

function applyHouseLaneBias(
  entry: RankedDesignReference,
  laneMatches: Map<HouseDesignLane, number>,
  normalizedPrompt: string,
) {
  for (const [lane, matches] of laneMatches.entries()) {
    const owners = HOUSE_LANE_OWNERS[lane];

    if (owners.includes(entry.reference.slug)) {
      entry.score += 220 + matches * 24;
      entry.reasons.push(`house:${lane}`);
      continue;
    }

    if (entry.reference.metadata.family !== 'cryzo') {
      continue;
    }

    if (lane === 'automotive-standard' && (entry.reference.slug === 'cryzo-5' || entry.reference.slug === 'cryzo-9')) {
      entry.score -= 32;
      entry.reasons.push('house:defer-performance');
    }

    if (lane === 'automotive-performance' && entry.reference.slug === 'cryzo-4') {
      entry.score -= 48;
      entry.reasons.push('house:defer-standard');
    }

    if (lane === 'automotive-standard' && entry.reference.slug === 'apple') {
      entry.score -= 60;
      entry.reasons.push('house:external-car-support-only');
    }

    if (lane === 'automotive-performance' && entry.reference.slug === 'apple') {
      entry.score -= 40;
      entry.reasons.push('house:external-performance-support-only');
    }

    if (lane === 'festival-world' && entry.reference.slug !== 'cryzo-1') {
      entry.score -= 18;
      entry.reasons.push('house:festival-lane-miss');
    }

    if (lane === 'furniture-showcase' && entry.reference.slug !== 'cryzo-3') {
      entry.score -= 18;
      entry.reasons.push('house:furniture-lane-miss');
    }

    if (lane === 'books-editorial' && entry.reference.slug !== 'cryzo-8') {
      entry.score -= 18;
      entry.reasons.push('house:books-lane-miss');
    }

    if (lane === 'pets' && entry.reference.slug !== 'cryzo-10') {
      entry.score -= 18;
      entry.reasons.push('house:pet-lane-miss');
    }

    if (lane === 'pets' && entry.reference.slug === 'apple') {
      entry.score -= 120;
      entry.reasons.push('house:external-pet-support-only');
    }
  }

  if (
    includesPhrase(normalizedPrompt, 'phone') &&
    includesPhrase(normalizedPrompt, 'website') &&
    entry.reference.slug === 'apple'
  ) {
    entry.score += 120;
    entry.reasons.push('category:phone-default');
  }
}

function getExplicitReferenceMatches(normalizedPrompt: string) {
  return designReferenceLibrary.filter((reference) =>
    reference.normalizedNames.some(
      (name) =>
        name &&
        includesPhrase(normalizedPrompt, name) &&
        (reference.metadata.family === 'cryzo' || hasExplicitStyleIntent(normalizedPrompt, name)),
    ),
  );
}

export function selectDesignReferenceDocs(messageText: string, limit = 2) {
  const normalizedPrompt = normalizeText(messageText);
  const promptTokens = tokenize(messageText);
  const explicitMatches = getExplicitReferenceMatches(normalizedPrompt);

  if (explicitMatches.length > 0) {
    const primary = explicitMatches[0];
    return [primary].slice(0, Math.max(1, limit));
  }

  const laneMatches = inferHouseLaneMatches(normalizedPrompt);

  const scoredReferences: RankedDesignReference[] = designReferenceLibrary
    .map((reference) => ({
      reference,
      ...scoreReference(reference, normalizedPrompt, promptTokens),
    }))
    .map((entry) => {
      applyHouseLaneBias(entry, laneMatches, normalizedPrompt);
      return entry;
    })
    .sort((left, right) => right.score - left.score || left.reference.slug.localeCompare(right.reference.slug));

  const primary = scoredReferences.find((entry) => entry.score >= MINIMUM_REFERENCE_SCORE);

  if (primary) {
    return [primary.reference].slice(0, Math.max(1, limit));
  }

  return LOW_SIGNAL_FALLBACK_SLUGS.map((slug) =>
    designReferenceLibrary.find((reference) => reference.slug === slug),
  )
    .filter((reference): reference is EnrichedDesignReferenceDoc => !!reference)
    .slice(0, limit);
}

export function routeDesignReferences(messageText: string, limit = 3): DesignReferenceRoutingResult {
  const normalizedPrompt = normalizeText(messageText);
  const promptTokens = tokenize(messageText);
  const selected = selectDesignReferenceDocs(messageText, limit);
  const laneMatches = inferHouseLaneMatches(normalizedPrompt);
  const promptCategories = inferPromptCategories(normalizedPrompt);
  const matchedSignals = [
    ...Array.from(inferSignalMatches(normalizedPrompt, INDUSTRY_SIGNALS).keys()),
    ...Array.from(inferSignalMatches(normalizedPrompt, PRODUCT_TYPE_SIGNALS).keys()),
    ...Array.from(laneMatches.keys()),
  ];

  const ranked = designReferenceLibrary
    .map((reference) => ({
      reference,
      ...scoreReference(reference, normalizedPrompt, promptTokens),
    }))
    .map((entry) => {
      applyHouseLaneBias(entry, laneMatches, normalizedPrompt);
      return entry;
    })
    .sort((left, right) => right.score - left.score || left.reference.slug.localeCompare(right.reference.slug))
    .slice(0, Math.max(limit, 5))
    .map((entry) => ({
      slug: entry.reference.slug,
      score: entry.score,
      reasons: entry.reasons,
    }));

  return {
    primary: selected[0],
    supporting: selected.slice(1),
    selectionSource: selected[0]?.source,
    matchedCategories: Array.from(promptCategories.keys()),
    matchedSignals: Array.from(new Set(matchedSignals)),
    ranked,
  };
}
