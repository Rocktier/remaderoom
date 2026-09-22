# RemadeRoom

AI room remodel previews: upload a photo of a real room, pick a style, get a photorealistic render
**with your walls, doors, windows and layout left exactly where they are**.

That last clause is the whole product. A pretty render of some other room is worthless — the point is
seeing *your* kitchen after the change. The generation prompt enforces it hard (fixed camera position,
perspective, ceiling height, and the position and size of every wall, door, window and beam; only
surfaces, ceiling, lighting, furniture, textiles and plants may change). See `buildPrompt()` in `server.mjs`.


## Status

Working today:

- Landing page and a three-step workbench (upload → pick style → render & compare with a before/after slider).
- Rendering through a small local proxy, with a mock provider by default so nothing costs money until you configure a key.
- Photos are resized client-side (long edge 1400 px) before they are ever sent anywhere.

Not done yet — do not read this repo as a finished product:

- **Interface copy is still Chinese.** An English copy pass is the next milestone before this faces overseas users.
- No accounts, no payments, no render history. The "free tries" counter lives in `sessionStorage` and resets freely;
  the only real cost guard is the server-side daily cap (`maxRendersPerDay`).
- The proxy is designed for a single machine. Serving public traffic needs a hosted function (see Roadmap).


## Running it

Requires Node.js 18 or newer — no dependencies, no install step, no build.

```bash
node server.mjs        # then open http://localhost:5173
```

The same file is a static server and the render proxy. To try the flow without any API key, leave
`provider` as `"mock"` — it returns a sample render and says so plainly in the UI.

To render for real, copy `engine.config.example.json` to `engine.config.json`, set `provider` to `"ark"`
and paste your key. Model choice is Volcengine Ark (Doubao Seedream): one key, synchronous response,
base64 in and out. Swapping providers means adding one function shaped like `callArk()` — the frontend
does not change.

Opening `index.html` straight from the filesystem still works: with no proxy present the app falls back
to a sample image and explains why, instead of showing a broken request.


## Security

The API key lives only in `engine.config.json`, which is git-ignored and additionally refused over HTTP —
`engine.config.json`, `server.log` and any dot-prefixed file return 403, and path-traversal attempts are
rejected the same way. Nothing under `js/` or `*.html` may ever hold a key: those files are public by
definition.

Because the proxy binds to your machine's LAN address too, anyone on the same Wi-Fi can use it to render.
`maxRendersPerDay` is what caps that. Stop the server when you are not demoing.

`private/` is intentionally ignored: it holds business analysis and pricing notes that have no place in a
public repository — including its history.


## Layout

```
index.html                    landing page
workbench.html                the three-step render flow
css/style.css                 shared design system (warm, editorial; design tokens at the top)
js/config.js                  style list, quota, render call (talks to the local proxy only)
js/workbench.js               flow state machine, before/after slider
js/main.js                    landing page interactions and GSAP motion
js/libs/                      vendored GSAP + ScrollTrigger
img/                          12 local JPEGs (~0.8 MB), no external image hosts
server.mjs                    static server + render proxy (zero dependencies)
engine.config.example.json    copy to engine.config.json and fill in a key
docs/                         operator guide and design spec (Chinese)
```


## Roadmap

1. English interface copy, then the brand pass (`index.html` still says the old Chinese name in 8 places).
2. Hosted proxy — Cloudflare Workers or a Vercel function holding the key as an environment secret,
   so the site can serve overseas visitors without your machine.
3. Stripe for overseas billing, replacing the WeChat/Alipay assumption in the original plan.
4. Accounts and persistent render history, replacing the `sessionStorage` pretend-quota.


## License

Source is public for visibility and hosting, not for reuse. See [LICENSE](LICENSE) —
© RemadeRoom. All rights reserved.
