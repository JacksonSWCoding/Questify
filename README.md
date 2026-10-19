<!-- Badges -->
<p align="center">
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://flask.palletsprojects.com/"><img src="https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" /></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"><img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" /></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" /></a>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" /></a>
</p>

<p align="center">
  <a href="https://developer.capitalone.com/"><img src="https://img.shields.io/badge/Capital_One_Nessie-004977?style=for-the-badge&logo=capital-one&logoColor=white" alt="Nessie" /></a>
  <a href="https://html.spec.whatwg.org/"><img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" /></a>
  <a href="https://www.w3.org/Style/CSS/"><img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" /></a>
</p>

---

<h1 align="center">Questify</h1>

<p align="center">
  <strong>Turn your goals into an adventure.</strong>
</p>

<p align="center">
  A gamified productivity web app where you complete real-world quests, earn XP and coins,
  unlock RPG-style gear, and spend coins on cosmetic shop items for your hero.
  <br />
  Built at <strong>SwampHacks 2026</strong>.
</p>

<p align="center">
  <a href="https://questify-pied.vercel.app/"><img src="https://img.shields.io/badge/-%E2%9A%94%EF%B8%8F%20Try%20It%20Now!-brightgreen?style=for-the-badge" alt="Try It Now" /></a>
  <a href="https://www.youtube.com/watch?v=IPMO2SrjTF8"><img src="https://img.shields.io/badge/-%E2%96%B6%20Demo%20Video-red?style=for-the-badge&logo=youtube&logoColor=white" alt="Demo Video" /></a>
</p>

<p align="center">
  <em>Production runs on Vercel serverless — quest progress on the live demo may reset between sessions or redeploys. Local development can use persistent SQLite.</em>
</p>

<p align="center">
  <em>The <a href="https://www.youtube.com/watch?v=IPMO2SrjTF8">YouTube demo</a> was recorded on an earlier build; UI and features may differ from <a href="https://questify-pied.vercel.app/">the live app</a>.</em>
</p>

---

## Overview

**Questify** turns everyday tasks into quests. Add a goal, pick a category (General, Fitness, Coding, or Creative), complete it, and your hero earns **XP**, **coins**, and **unlockable equipment**. Coins feed a **cosmetic shop** (hats, hoodies, backgrounds) once you have unlocked the right evolution gear. Customize your character model and equipped items from the dashboard.

The UI uses vanilla JavaScript with a fantasy RPG presentation—XP bars, unlock animations, confetti, and a shop tied to progression.

## How It Works

1. **Accept a quest** — enter a title and category, then add it to today’s list.
2. **Complete the quest** — check it off to earn **10 XP** in that category (the server applies coin bonuses and gear unlocks).
3. **Evolve your hero** — category XP unlocks gear (shoes, capes, wands, and more) and updates your **dominant trait**.
4. **Earn coins** — rewards scale with level-ups and new unlocks; on production, **Capital One Nessie** can record deposits and purchases against a sandbox account.
5. **Visit the shop** — buy cosmetics when you have enough coins and the right gear unlocked; equip items from the shop or customization modal.
6. **Customize** — switch male/female base models and manage equipped evolution gear and purchased cosmetics.

## Key Features

- **Categorized quests** — General, Fitness, Coding, and Creative with distinct XP tracks.
- **Evolution system** — per-category thresholds unlock visible gear on your avatar.
- **Coin economy & shop** — buy and equip cosmetics; server validates unlock requirements and balance.
- **Nessie wallet integration** (production `app.py`) — API-backed deposits and purchases with graceful fallback when keys are missing.
- **Character customization** — model, evolution gear, and shop cosmetics with server-synced equip state.
- **Completed quest history** — collapsible list of finished quests on the task board.
- **Deployed on Vercel** — Flask via `@vercel/python` with static assets bundled in `vercel.json`.

## Engineering Highlights

- **Two deliberate entry points.** Production deploys root **`app.py`** (JSON task store + `evolution_logic` + Nessie). Local integrated dev uses **`backend/server.py`** with **SQLite** (`instance/tasks.db`) and the same REST surface the frontend expects.
- **Serverless storage tradeoff.** On Vercel, task and state files live under **`/tmp`** — appropriate for a hackathon demo, not durable multi-user storage. The live UI notes this on non-localhost hosts.
- **Scaled coin rewards on the SQLite backend.** Completing a quest awards base coins plus bonuses for level-ups and newly unlocked gear; unit tests match that formula.
- **Reset semantics.** Hero reset clears XP and evolution equipment but **preserves coins and shop inventory** on the SQLite server; invalid equip requests return **400** without partially saving the character model.
- **Shop state: server over cache.** Equipped cosmetics prefer API responses over stale browser storage after cold starts or new devices.

## Tech Stack

### Frontend

- **Vanilla JavaScript** — task board, shop, customization, evolution visuals
- **HTML / CSS** — `layout/index.html`, `static/`
- **Canvas Confetti** — completion feedback

### Backend

- **Python 3 + Flask** — REST API and static file serving
- **`app.py`** — Vercel entry (tasks in JSON, Nessie wallet, evolution state)
- **`backend/server.py`** — local SQLite backend (tasks, player, shop inventory)
- **`evolution_logic.py`** — category XP, unlocks, dominant trait
- **`nessie_service.py`** — Capital One Nessie HTTP client

### Data & deployment

- **SQLite** — local persistence (`backend/instance/`, gitignored)
- **JSON / `/tmp`** — paths used when `VERCEL` is set
- **[Vercel](https://vercel.com/)** — `vercel.json` routes to `app.py`

### Testing

- **`backend/test_server.py`** — unittest suite against `backend/server.py`

## Getting Started

### Prerequisites

- Python 3.10+ (3.11+ recommended)
- Git

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/RyanXi11/Questify.git
   cd Questify
   ```

2. Create a virtual environment and install dependencies:

   **Windows (PowerShell)**

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

   **macOS / Linux**

   ```bash
   python3 -m venv .venv
   ./.venv/bin/pip install -r requirements.txt
   ```

3. Environment variables (optional locally; required on Vercel for full wallet/shop):

   ```bash
   cp .env.example .env
   ```

   Fill in:

   ```
   NESSIE_API_KEY=
   NESSIE_ACCOUNT_ID=
   NESSIE_MERCHANT_ID=
   ```

4. Run the app (pick one):

   **Production-like (matches Vercel — `app.py`)**

   ```bash
   # Windows: .\.venv\Scripts\python.exe app.py
   python app.py
   ```

   **Local integrated server (SQLite — `backend/server.py`)**

   ```bash
   # Windows: .\.venv\Scripts\python.exe backend/server.py
   python backend/server.py
   ```

5. Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.

### Scripts

| Command | Description |
| -------- | ------------- |
| `python app.py` | Run Vercel-style Flask app locally |
| `python backend/server.py` | Run SQLite-backed integrated server |
| `python backend/test_server.py` | Run backend unit tests |

### Deploy (Vercel)

- Connect [github.com/RyanXi11/Questify](https://github.com/RyanXi11/Questify) to Vercel; `vercel.json` points to `app.py`.
- Set **Environment Variables**: `NESSIE_API_KEY`, `NESSIE_ACCOUNT_ID`, `NESSIE_MERCHANT_ID` (recommended).
- Optional: `RESET_DISABLED=true` to block `POST /api/reset-state` on production.

Live deployment: **[questify-pied.vercel.app](https://questify-pied.vercel.app/)**

## Project Structure

```
Questify/
├── app.py                 # Vercel / production entry
├── evolution_logic.py     # Category XP, unlocks, dominant trait
├── nessie_service.py      # Nessie wallet & shop purchases
├── vercel.json            # Vercel Python build & routes
├── layout/
│   └── index.html         # Main UI shell
├── static/                # JS, CSS, images, favicon
├── backend/
│   ├── server.py          # Local SQLite Flask server
│   └── test_server.py     # API tests
├── .env.example           # Env template (never commit .env)
└── requirements.txt
```

## Team

Built at **SwampHacks 2026** by:

- **Ryan Xi** — [GitHub](https://github.com/RyanXi11)
- **Jackson Snyder** — [GitHub](https://github.com/JacksonSWCoding)
- **Anthony Vargas** — [GitHub](https://github.com/AntVa0403)
- **Temituoyo Brown** — [GitHub](https://github.com/Temituoyo9789)

## Credits

- **[Capital One Nessie](https://developer.capitalone.com/)** — sandbox banking API for wallet flows
- **[Flask](https://flask.palletsprojects.com/)** — web framework
- **[Vercel](https://vercel.com/)** — deployment
- **LPC / sprite assets** — character and gear art (attribute per your asset license)
- **Google Fonts** — Cinzel, Inter (see `layout/index.html`)
- **Cursor** — development environment

## Contact

- **Ryan Xi** — [LinkedIn](https://www.linkedin.com/in/ryan-xi)

## Future Roadmap

### Features

- [ ] User accounts and persistent cloud storage (Postgres/KV)
- [ ] Single unified backend (merge `app.py` and `backend/server.py`)
- [ ] Quest streaks and daily challenges
- [ ] Updated demo video matching the current live UI

### Improvements

- [ ] Durable task history on Vercel (replace `/tmp` JSON)
- [ ] Shared shop catalog module (one source for Python + JS)
- [ ] `og:image` and README demo GIF for link previews

---

<p align="center">
  Made with quests and XP at SwampHacks 2026
</p>
