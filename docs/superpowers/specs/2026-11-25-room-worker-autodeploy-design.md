# Room Worker auto-deploy

Mirror the landing site's GitHub Actions deployment in a separate workflow for
the existing `ytparty-room` Worker. Build the room frontend against
`https://music.ytparty.my.id` and publish only `apps/web/dist` to
`room.ytparty.my.id`. Trigger on room or shared build inputs on `main` and
`master`, with manual dispatch restricted to those branches. Reuse the landing
workflow's Cloudflare secrets. Leave landing, backend and extension unchanged.

GitHub Actions is preferred over Cloudflare Git integration because it uses the
repository's established deployment and secrets setup. Check locally without
pushing, changing Cloudflare configuration or publishing a new Worker version.
