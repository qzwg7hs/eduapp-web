# Going live — deployment checklist

The code is now deployment-ready (env-driven config, Dockerfile, git repo
initialized with an initial commit). Everything below is done through web
dashboards — no more coding required, just account setup and clicking
through a few forms.

Recommended stack for this app's size (small school, low traffic):

| Piece              | Where                        | Cost                    |
|---------------------|-------------------------------|--------------------------|
| Domain name         | Cloudflare Registrar or Namecheap | ~$10–15/year        |
| Backend + Postgres  | Railway                       | ~$5–20/month            |
| Frontend (static)   | Vercel                        | Free                    |
| Image storage       | Cloudflare R2 (already set up)| Already in use, free tier covers this easily |

---

## 1. Buy the domain

Pick a registrar and buy the name you want (e.g. `eduapp.kz`, `mathnest.com`).
- **Cloudflare Registrar** (domains.cloudflare.com) sells at cost, no markup — recommended since you already have a Cloudflare account for R2.
- **Namecheap** is the other easy, reputable option.

Nothing else to do here yet — just own the name. DNS gets pointed later (step 5).

## 2. Push the code to GitHub

The local repo is already initialized and committed. Create a new **private**
repository on GitHub, then from `eduapp-web/`:

```
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

## 3. Deploy the backend + database on Railway

1. Sign up at railway.app (can use your GitHub login).
2. **New Project → Deploy from GitHub repo** → pick this repo.
3. Railway will find multiple things in the repo — set this service's
   **root directory to `backend/`** (Settings → root directory). It will
   detect the `Dockerfile` and build from that automatically.
4. **New → Database → PostgreSQL** in the same project. Railway gives you a
   `DATABASE_URL` for it automatically.
5. On the backend service, go to **Variables** and set:
   - `DATABASE_URL` → reference the Postgres service's URL (Railway lets you
     link it directly, or paste it)
   - `SECRET_KEY` → generate one: `python -c "import secrets; print(secrets.token_hex(32))"`
   - `ALGORITHM` → `HS256`
   - `ACCESS_TOKEN_EXPIRE_MINUTES` → `10080`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` → copy these from your local `backend/.env`
   - `CORS_ORIGINS` → the frontend URL you'll get in step 4 (you can update this after)
6. Deploy. Railway gives the backend a public URL like
   `https://your-app.up.railway.app` — the API will be at
   `https://your-app.up.railway.app/api`.
7. Visit `https://your-app.up.railway.app/api/health` — should return
   `{"status":"ok"}`. The database tables and migrations run automatically
   on startup (same as locally), so nothing manual needed there.
8. **Create the admin account**: the very first admin login was created
   locally via `backend/seed_users.py` / `backend/create_admin.py` against
   your local database — those scripts need to be re-run once, pointed at
   the production `DATABASE_URL`, to create real accounts in the production
   database (or ask me to help with this when you're at this step, since it
   needs the production DB credentials in hand).

## 4. Deploy the frontend on Vercel

1. Sign up at vercel.com with GitHub.
2. **Add New → Project** → pick this repo.
3. Set **root directory to `frontend/`**.
4. Framework preset: Vite (auto-detected).
5. **Environment Variables** → add:
   - `VITE_API_URL` → `https://your-app.up.railway.app/api` (the backend URL from step 3)
6. Deploy. Vercel gives you a URL like `https://your-app.vercel.app` —
   confirm the site loads and you can log in.
7. Go back to Railway and update `CORS_ORIGINS` to this Vercel URL (and later
   your final custom domain, comma-separated if you want both).

## 5. Point your domain at it

In your domain registrar's DNS settings (or Cloudflare DNS if you bought it
there):
- Frontend: add the domain in Vercel's project **Settings → Domains**,
  Vercel tells you exactly what DNS record to add (usually a `CNAME` or `A`
  record). Do this for both `your-domain.com` and `www.your-domain.com`.
- Backend (optional custom subdomain): add `api.your-domain.com` in
  Railway's service **Settings → Domains** the same way, if you want a nicer
  API URL than the `*.up.railway.app` one. If you do this, update
  `VITE_API_URL` on Vercel and `CORS_ORIGINS` on Railway to match.

DNS changes can take anywhere from a few minutes to a few hours to propagate.
Both Vercel and Railway auto-issue free HTTPS certificates once DNS is
pointed correctly — no separate SSL step needed.

## 6. Final checks once live

- Log in as both an admin and a student account on the real domain.
- Upload a lesson image and a Test Bank/POD docx through the live admin
  panel to confirm R2 storage and the database both work end-to-end in
  production.
- Bookmark the Railway and Vercel dashboards — that's where you'll come back
  to check logs if anything goes wrong, and where usage/billing shows up.

---

**Note on secrets**: the real `backend/.env` file was deliberately left out
of git (see `.gitignore`) since it contains your database password, JWT
secret, and R2 keys — those get entered directly into Railway's dashboard
instead, never committed to the repo.
