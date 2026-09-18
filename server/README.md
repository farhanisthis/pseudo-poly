# PseudoPoly Multiplayer Backend Server

Standalone Node.js + Express + Socket.IO server powering PseudoPoly multiplayer rooms.

## Local Setup

```bash
cd server
npm install
npm start
```
By default, the server starts on `http://0.0.0.0:3001`.

---

## Free Cloud Deployment (1-Click)

### Option 1: Deploy to Render.com (Recommended - Free)
1. Push this `server/` folder to a GitHub repository (or point to the root repository with root directory set to `server`).
2. Go to [Render.com](https://render.com) and create a **New Web Service**.
3. Connect your GitHub repository.
4. Set the following:
   - **Root Directory**: `server` (or leave empty if the repo only contains the server)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click **Create Web Service**.
6. Render will assign you a free HTTPS URL, for example:
   `https://pseudopoly-server.onrender.com`
7. Copy this URL into the PseudoPoly Android/web app under **Online Multiplayer** settings!

### Option 2: Deploy to Railway.app (Free / Low Cost)
1. Go to [Railway.app](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your repository and specify `server` as the root directory.
4. Generate a domain in **Settings** -> **Networking**.
5. Copy your Railway HTTPS URL into the app.

---

## Health Check Endpoint
To verify the server is running, open the server URL in your browser:
- `GET /` -> Returns JSON `{ status: "ok", game: "PseudoPoly Server", activeRooms: 0, uptime: ... }`
- `GET /health` -> Returns JSON `{ status: "healthy" }`
