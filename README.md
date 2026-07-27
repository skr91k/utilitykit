# Utility Kit

# [https://utilitykit.web.app/](https://utilitykit.web.app/)

```bash
npm run build && firebase deploy --only hosting
```

## Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite 7** - Build tool and dev server
- **Tailwind CSS 4** - Styling
- **React Router 7** - Client-side routing
- **Firebase** - Hosting and backend services
- **Recharts** - Charts and data visualization

## Pages

| Page | Path | Description |
|------|------|-------------|
| 🏠 Home | `/` | Landing page with searchable utility grid |
| 📋 Paste Bin | `/paste` | Public & private pastes with share links, syntax styling and clickable URLs |
| 🔳 QR Code Generator | `/qr` | Generate and download QR codes for URLs, text, WiFi |
| 🔢 Counter | `/counter` | Digital tally counter with customizable cooldown and persistent count |
| 💪 Workout Manager | `/workout` | Track reps, steps & rest timer |
| 🕌 Prayer Times | `/prayer` | Islamic prayer times with iqama countdown and monthly calendar |
| 💸 Split Expense | `/split` | Split bills with friends, shareable via link |
| 🏏 Cricket Tracker | `/cricket` | Track series, matches & live ball-by-ball scores |
| 📈 P&L Dashboard | `/pl` | Profit & Loss dashboard with charts |
| 🔐 Encryption Tool | `/encrypt` | Encrypt/decrypt text using AES, DES, Triple DES, Rabbit |
| ⏳ Epoch Converter | `/epoch` | Convert Unix timestamps to dates and vice versa |
| 🗄️ SQLite Viewer | `/sqlite` | Browse SQLite databases and run SQL queries in-browser |
| 🔤 String Tools | `/string` | Base64, URL encode, HTML entities, MD5/SHA hashes |
| 🔑 JWT Decoder | `/jwt` | Decode & inspect JWT tokens — claims, expiry, header |
| 📊 Price Unpacker | `/priceDecoder` | Unpack OHLC binary zip — preview as JSON/CSV, download repacked |
| 💬 Contact Us | `/contactus` | Get in touch or send feedback |
| 📺 TV Channels | `https://tv1.web.app/` | Watch Live TV Channels |
| 📚 Islamic Books | `https://islamicbooks2.web.app/` | Read Islamic Books Online |

## Paste Bin

A public board plus a per-account private bin, at `/paste`.

- **Public** — anyone can post, edit, copy or remove. No login.
- **Private** — requires Google sign-in; pastes are stored under the signed-in account and the tab is selected by default once you are logged in.
- **Share links** — every paste can be shared as a read-only full-document view:
  - `/paste/p/:id` for a public paste, pointing straight at the document.
  - `/paste/s/:token` for a private one. Because private pastes are owner-only by security rule, sharing publishes a read-only copy under a 128-bit random token. Edits sync to it, deleting the paste deletes it, and **Unshare** revokes it.
- **Rendering** — pastes longer than 100 lines collapse with a "show all" toggle. Content that looks like code gets a line-number gutter and language-agnostic highlighting (comments, strings, numbers, common keywords); notes and link lists stay plain wrapped text with clickable URLs.
- **Size** — a Firestore document is capped at 1 MiB, so paste content is limited to 1,000,000 bytes. Oversized text shows a warning and can be saved truncated at a character boundary.

### Firestore collections

| Collection | Read | Write |
|---|---|---|
| `publicPastes/{id}` | anyone | anyone (size-guarded) |
| `users/{uid}/pastes/{id}` | owner | owner |
| `sharedPastes/{token}` | anyone with the token (`get` only — `list` denied so the collection cannot be enumerated) | owner only |

## Deploying

```bash
npm run build && firebase deploy --only hosting   # app
firebase deploy --only firestore:rules            # security rules
```
