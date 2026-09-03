export type SelectedComposioApp = {
  slug: string;
  name: string;
  domain?: string;
};

export type AppConnection = SelectedComposioApp & {
  logo?: string;
  isConnected: boolean;
  connectedAccountId?: string;
  available: boolean;
  requiresAuth?: boolean;
};

const APP_ALIASES: Record<string, string[]> = {
  facebook: ["facebook", "facebook pages"],
  meta_ads: [
    "meta",
    "meta ads",
    "meta advertising",
    "facebook ads",
    "facebook advertising",
    "instagram ads",
  ],
  instagram: ["instagram", "ig"],
  whatsapp: ["whatsapp", "whats app"],
  gmail: ["gmail", "email", "emails", "inbox"],
  googlesheets: ["google sheets", "sheets", "spreadsheet", "spreadsheets"],
  googledocs: ["google docs", "docs", "document", "documents"],
  googlecalendar: ["google calendar", "calendar", "meeting", "meetings"],
  googledrive: ["google drive", "drive"],
  github: ["github", "repo", "repository", "pull request", "issue"],
  microsoftteams: ["microsoft teams", "teams"],
  linkedin: ["linkedin", "linked in"],
  linkedin_ads: ["linkedin ads", "linked in ads"],
  reddit: ["reddit", "subreddit", "subreddits", "redditor", "karma"],
  twitter: ["twitter", "x", "tweet", "tweets"],
  youtube: ["youtube", "you tube"],
};

export const SELECTED_COMPOSIO_APPS = [
  { slug: "stripe", name: "Stripe", domain: "stripe.com" },
  { slug: "salesforce", name: "Salesforce", domain: "salesforce.com" },
  { slug: "slack", name: "Slack", domain: "slack.com" },
  { slug: "notion", name: "Notion", domain: "notion.so" },
  { slug: "googlecalendar", name: "Google Calendar", domain: "calendar.google.com" },
  { slug: "googledrive", name: "Google Drive", domain: "drive.google.com" },
  { slug: "gmail", name: "Gmail", domain: "mail.google.com" },
  { slug: "googlesheets", name: "Google Sheets", domain: "sheets.google.com" },
  { slug: "googleslides", name: "Google Slides", domain: "slides.google.com" },
  { slug: "googledocs", name: "Google Docs", domain: "docs.google.com" },
  { slug: "googlebigquery", name: "Google BigQuery", domain: "cloud.google.com" },
  { slug: "googletasks", name: "Google Tasks", domain: "tasks.google.com" },
  { slug: "googlemeet", name: "Google Meet", domain: "meet.google.com" },
  { slug: "hubspot", name: "HubSpot", domain: "hubspot.com" },
  { slug: "linkedin", name: "LinkedIn", domain: "linkedin.com" },
  { slug: "twitter", name: "X", domain: "x.com" },
  { slug: "tiktok", name: "TikTok", domain: "tiktok.com" },
  { slug: "discord", name: "Discord", domain: "discord.com" },
  { slug: "github", name: "GitHub", domain: "github.com" },
  { slug: "gitlab", name: "GitLab", domain: "gitlab.com" },
  { slug: "box", name: "Box", domain: "box.com" },
  { slug: "clickup", name: "ClickUp", domain: "clickup.com" },
  { slug: "googleanalytics", name: "Google Analytics", domain: "analytics.google.com" },
  { slug: "outlook", name: "Outlook", domain: "outlook.live.com" },
  { slug: "linear", name: "Linear", domain: "linear.app" },
  { slug: "dropbox", name: "Dropbox", domain: "dropbox.com" },
  { slug: "googlesearchconsole", name: "Google Search Console", domain: "search.google.com" },
  { slug: "googleclassroom", name: "Google Classroom", domain: "classroom.google.com" },
  { slug: "airtable", name: "Airtable", domain: "airtable.com" },
  { slug: "microsoftteams", name: "Microsoft Teams", domain: "teams.microsoft.com" },
  { slug: "sharepoint", name: "SharePoint", domain: "sharepoint.com" },
  { slug: "onedrive", name: "OneDrive", domain: "onedrive.live.com" },
  { slug: "typeform", name: "Typeform", domain: "typeform.com" },
  { slug: "huggingface", name: "Hugging Face", domain: "huggingface.co" },
  { slug: "calendly", name: "Calendly", domain: "calendly.com" },
  { slug: "contentful", name: "Contentful", domain: "contentful.com" },
  { slug: "supabase", name: "Supabase", domain: "supabase.com" },
  { slug: "gong", name: "Gong", domain: "gong.io" },
  { slug: "ramp", name: "Ramp", domain: "ramp.com" },
  { slug: "facebook", name: "Facebook", domain: "facebook.com" },
  { slug: "docusign", name: "DocuSign", domain: "docusign.com" },
  { slug: "apollo", name: "Apollo", domain: "apollo.io" },
  { slug: "rocketlane", name: "Rocketlane", domain: "rocketlane.com" },
  { slug: "telegram", name: "Telegram", domain: "telegram.org" },
  { slug: "ticktick", name: "TickTick", domain: "ticktick.com" },
  { slug: "workday", name: "Workday", domain: "workday.com" },
  { slug: "hackernews", name: "Hacker News", domain: "news.ycombinator.com" },
  { slug: "zendesk", name: "Zendesk", domain: "zendesk.com" },
  { slug: "confluence", name: "Confluence", domain: "atlassian.com" },
  { slug: "instagram", name: "Instagram", domain: "instagram.com" },
  { slug: "posthog", name: "PostHog", domain: "posthog.com" },
  { slug: "snowflake", name: "Snowflake", domain: "snowflake.com" },
  { slug: "zohocrm", name: "Zoho CRM", domain: "zoho.com" },
  { slug: "monday", name: "Monday", domain: "monday.com" },
  { slug: "pipedrive", name: "Pipedrive", domain: "pipedrive.com" },
  { slug: "vercel", name: "Vercel", domain: "vercel.com" },
  { slug: "reddit", name: "Reddit", domain: "reddit.com" },
  { slug: "meta_ads", name: "Meta Ads", domain: "facebook.com" },
  { slug: "excel", name: "Excel", domain: "microsoft.com" },
  { slug: "linkedin_ads", name: "LinkedIn Ads", domain: "linkedin.com" },
  { slug: "youtube", name: "YouTube", domain: "youtube.com" },
  { slug: "mailchimp", name: "Mailchimp", domain: "mailchimp.com" },
  { slug: "whatsapp", name: "WhatsApp", domain: "whatsapp.com" },
  { slug: "googleads", name: "Google Ads", domain: "ads.google.com" },
  { slug: "resend", name: "Resend", domain: "resend.com" },
  { slug: "shopify", name: "Shopify", domain: "shopify.com" },
] as const satisfies readonly SelectedComposioApp[];

export const SELECTED_COMPOSIO_APP_SLUGS = SELECTED_COMPOSIO_APPS.map(
  (app) => app.slug,
);

export const INITIAL_APP_CONNECTIONS: AppConnection[] =
  SELECTED_COMPOSIO_APPS.map((app) => ({
    ...app,
    isConnected: false,
    available: false,
  }));

function wordsFromDomain(domain?: string) {
  if (!domain) return [];
  const [host] = domain.split(".");
  return host ? [host] : [];
}

export function getComposioAppAliases(app: SelectedComposioApp) {
  return [
    app.name,
    app.slug,
    app.slug.replace(/[_-]/g, " "),
    ...wordsFromDomain(app.domain),
    ...(APP_ALIASES[app.slug] ?? []),
  ]
    .map((alias) => alias.trim().toLowerCase())
    .filter(Boolean);
}

export function getSelectedComposioApp(slug: string) {
  return SELECTED_COMPOSIO_APPS.find((app) => app.slug === slug);
}

