export const PRODUCT_REDIRECTS = { deepseek: "deepseek-api" } as const;

export const PRODUCT_API_PAIRS: Readonly<Record<string, string>> = {
  claude: "claude-api",
  cursor: "cursor-api",
  grok: "grok-api",
  freepik: "freepik-api",
};

// Public slugs, checked against the published catalog before rendering links.
export const ARTICLE_PRODUCTS: Readonly<Record<string, readonly string[]>> = {
  "buy-chatgpt-plus-iran": ["chatgpt"],
  "claude-pro-vs-api": ["claude", "claude-api"],
  "github-student-developer-pack": ["github-education"],
  "persian-prompting-guide": ["chatgpt", "claude"],
  "chatgpt-vs-claude-vs-gemini": ["chatgpt", "claude", "gemini"],
  "dedicated-vs-shared-ai-accounts": ["chatgpt", "gemini"],
  "cursor-vs-claude-code-vs-copilot": ["cursor", "claude"],
  "google-ai-pro-ultra-worth-it": ["gemini"],
  "ai-video-generators-veo-kling-runway": ["runway"],
  "spotify-premium-iran": ["spotify"],
};
