# Cryzo dynamic reasoning levels and composer

The chat composer now exposes the selected model by its live catalog name. Build and Plan
are in the + menu, followed by Upload image and the existing MCP connectors. Selecting
an action closes the + menu. Chat mode is independent of reasoning effort.

`/api/models/catalog` reads models.dev metadata, including `reasoning_options`, and
for Cryzo-managed models consumes OpenRouter `reasoningOptions`. The reasoning picker
only appears for models with explicitly supported reasoning efforts and valid request
mappings. "Default" leaves the provider's native behavior unchanged. Unsupported levels
aren't invented, and providers without supported effort controls hide the picker.

Chat settings are remembered per model within each conversation in Convex's
`modelReasoningPreferences` map. New-chat selections carry the requested effort into
conversation creation. The same effort is passed to plan, build, tools, continuation,
backend repair, and design revision calls. Provider-specific request options are
normalized in `src/lib/ai/reasoning-config.ts` and never applied to providers whose
request shape is unknown.

Regression: check Build/Plan switch closes + menu, attachments and MCP still work,
model name renders across desktop and mobile, selecting High persists after reload and
actually reaches upstream requests; switching models restores that model's last saved
effort, unsupported options are never offered, and `Default` sends no override.
