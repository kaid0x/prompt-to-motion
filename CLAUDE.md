# prompt-to-motion

This repo turns a brief into a narrated, word-synced motion-graphics MP4. For any request to make,
change or re-render a video, follow `skill/motion-video/SKILL.md` (also available as the project skill
`motion-video`). Read its `references/scene-api.md` before writing a scene and `references/pitfalls.md`
before rendering.

- One folder per video in `projects/<name>/`, one scene module per video in `app/src/scenes/<name>.ts`.
- Start from `projects/starter` + `app/src/scenes/starter.ts`, or `portfolio_intro.ts` for a full example.
- Time everything to words (`WT('word')`). Check contact sheets of every beat and transition before rendering.
- Long renders: `pipeline/render.sh` is resumable; start it detached and poll.
