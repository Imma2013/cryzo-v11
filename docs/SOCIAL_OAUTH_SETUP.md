# Cryzo social OAuth setup

Cryzo uses one Composio custom auth configuration per platform. Customers authorize their own accounts; never store customer tokens or platform client secrets in source control.

Set these protected Vercel and Convex environment variables to the auth-config IDs from the Cryzo Composio project:

| Network | Environment variable | Required app permissions |
| --- | --- | --- |
| X | `COMPOSIO_TWITTER_AUTH_CONFIG_ID` | `tweet.read tweet.write users.read offline.access media.write` |
| Facebook Pages | `COMPOSIO_FACEBOOK_AUTH_CONFIG_ID` | `pages_show_list pages_read_engagement pages_manage_posts`; add `read_insights` for analytics |
| Instagram professional | `COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID` | `instagram_basic instagram_content_publish pages_show_list pages_read_engagement`; add `instagram_manage_insights` for analytics |
| YouTube | `COMPOSIO_YOUTUBE_AUTH_CONFIG_ID` | `youtube.upload youtube.readonly`, offline access; add `yt-analytics.readonly` for analytics |
| Reddit | `COMPOSIO_REDDIT_AUTH_CONFIG_ID` | `identity read submit flair`; add `history mysubreddits` for account context |
| TikTok | `COMPOSIO_TIKTOK_AUTH_CONFIG_ID` | `user.info.basic video.publish video.list` |
| LinkedIn | `COMPOSIO_LINKEDIN_AUTH_CONFIG_ID` | Personal: `openid profile w_member_social`; organizations additionally require `rw_organization_admin w_organization_social r_organization_social` and Community Management approval |

Register the exact callback URL displayed by each Composio auth configuration in its platform developer portal. Complete the platform's app review and verification before enabling that connection. Users must reconnect after scopes change.

The same `connectedAccountId` is bound once to a user's account-level Marketing workspace and used by manual publishing, confirmed AI proposals, and scheduled jobs across projects. Existing project-bound connections remain readable and are promoted to account level when reattached. A Composio Playground connection is not a customer connection.
