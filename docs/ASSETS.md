# Assets — production checklist

Tracked separately so the public README stays free of "coming soon" / TODO clutter.

## Done

- [x] `docs/architecture.svg` — system architecture diagram, dark-mode-aware

## Still to produce (user)

- [ ] **Hero GIF** — 10–20 s screencap of Claude Desktop → prompt → MCP tool call → wiring diagram appears.
  - Path: `docs/hero.gif`
  - Spec: 1080p, sub-5 MB, clean workspace, no notifications. Tools: ScreenStudio or CleanShot X.
  - When ready, insert at the top of `README.md` directly under the H1 + tagline:
    ```markdown
    ![Demo](./docs/hero.gif)
    ```

- [ ] **Three demo screenshots** — actual outputs of the three demo prompts in `README.md` § Demo.
  - Paths: `docs/demo-1-sailboat.png`, `docs/demo-2-wire-gauge.png`, `docs/demo-3-diagram.png`
  - Each replaces the corresponding fenced ASCII block (or sits next to it).

- [ ] **GitHub social preview banner** — 1280×640 PNG.
  - Path: `docs/social-preview.png`
  - Upload via repo Settings → Social preview. Important for HN / X shares.

- [ ] **Largo build series link** — when published, add to § About:
  > Built while refitting *Largo* — see the [build log](https://...).

- [ ] **Founder contact in § About** — X handle / email when you want them public.

## Out of scope (don't add)

- Logos / wordmarks beyond the existing `public/icon-96.png` (used in MCP registry, not needed in README hero).
- A "Coming soon" section in the README.
