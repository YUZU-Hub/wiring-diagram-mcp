# MCP Registry & Directory Submissions

How `wiring-diagram-mcp` gets discovered. MCP servers are found through directories and
aggregators, not Google — this is the growth channel. Keep this list current as you submit.

## Canonical assets (copy-paste these everywhere)

| Field | Value |
|---|---|
| Registry name (reverse-DNS) | `io.github.YUZU-Hub/wiring-diagram-mcp` |
| Display name | VoltPlan Wiring Diagrams |
| Hosted endpoint (remote, HTTP) | `https://mcp.voltplan.app/mcp` |
| Transport | streamable-http |
| npm package | `wiring-diagram-mcp` |
| GitHub repo | https://github.com/YUZU-Hub/wiring-diagram-mcp |
| Landing page | https://voltplan.app/wiring-diagram-mcp |
| Website | https://voltplan.app |
| Icon (96x96) | https://mcp.voltplan.app/public/icon-96.png |
| License | MIT |
| Category / tags | developer-tools, electrical, energy, diagrams, hardware |

**Short description (≤100 chars):**
> Generate 12V/24V/48V wiring diagrams and size wires, fuses, batteries, solar, and inverters.

**Long description:**
> A Model Context Protocol server that gives Claude, Cursor, or any MCP client domain expertise in
> 12V/24V/48V DC electrical systems. It generates complete wiring diagrams (PNG/SVG) and sizes wire
> gauge, fuses, battery banks, solar arrays, inverters, and charging times for campers, boats, vans,
> and off-grid builds — using real DC sizing rules (3% voltage drop, 125% fuse rule, NEC/ABYC-aligned
> ampacities), not generic box-and-arrow diagramming. Hosted and free, no install: just add the URL.

**Keywords:** mcp, model-context-protocol, wiring-diagram, electrical, camper, off-grid, boat, solar, battery, wire-gauge, vanlife, rv, 12v, power-budget, voltplan

**Hosted config snippet:**
```json
{ "mcpServers": { "wiring-diagram": { "url": "https://mcp.voltplan.app/mcp" } } }
```

**Claude Code one-liner:**
```bash
claude mcp add wiring-diagram --transport http https://mcp.voltplan.app/mcp
```

---

## Submission checklist

### Done
- [x] **Official MCP Registry** (registry.modelcontextprotocol.io) — live via `server.json` + the
      `.github/workflows/publish-mcp-registry.yml` OIDC flow. **Re-run on next version tag** to push the
      updated description/metadata.
- [x] **npm** (`wiring-diagram-mcp`) — live. **Republish needed** to ship the reworked README,
      the unified description, and the new `repository`/`homepage`/`files` fields.

### In-repo claims added (no form needed)
- [x] **Glama** — `glama.json` with `maintainers: ["Chadd-Yuzuhub"]` added at repo root. Glama
      auto-indexes public GitHub repos tagged `mcp-server`; the file lets you claim/manage the listing.
      After it indexes, confirm/claim at https://glama.ai/mcp/servers (search "wiring diagram").

### To submit (off-site forms — do these manually)
- [ ] **Smithery** — https://smithery.ai/new — paste the hosted URL `https://mcp.voltplan.app/mcp`.
      Smithery scans the endpoint for tools automatically (no repo file needed for a hosted server).
      If the scan ever fails, serve `/.well-known/mcp/server-card.json` from mcp.voltplan.app as a fallback.
- [ ] **mcp.so** — https://mcp.so/submit — submit the GitHub repo URL. Scrapes the README.
- [ ] **PulseMCP** — https://www.pulsemcp.com/submit — submit repo + hosted URL.
- [ ] **Cursor Directory** — https://cursor.directory — submit as an MCP server with the config snippet.
- [ ] **awesome-mcp-servers** (punkpeye) — https://github.com/punkpeye/awesome-mcp-servers — open a PR
      adding an entry under a relevant category (e.g. "Developer Tools" / hardware). Use the short
      description above.
- [ ] **mcpservers.org** — https://mcpservers.org — submit via their GitHub PR flow.
- [ ] **Docker MCP Catalog** (optional) — repo already ships a `Dockerfile`; submit if you want the
      Docker Desktop MCP toolkit listing.

### Signal (off-platform, ongoing)
- [ ] Stars matter: Glama and most aggregators rank by GitHub stars + recency. Currently 0 — seed via
      the VoltPlan newsletter, the /wiring-diagram-mcp page, and relevant subreddits (r/vanlife,
      r/boatbuilding, r/solar, r/mcp).

---

## Notes
- Keep the short description **≤100 chars** — the official MCP registry schema rejects longer.
- When tools change, bump the version and tag (`v0.x.y`); the CI republishes `server.json` to the
  official registry. Aggregators that scrape GitHub/npm pick up changes on their next crawl.
