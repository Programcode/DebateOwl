# Deployment Guide: DebateLab

## 1. Local Configuration
DebateLab uses a **Runtime Configuration** pattern. Secrets are NOT baked into the build layers.

Before deploying, ensure `public/config.js` is set up:
```javascript
window.env = {
  VITE_OPENAI_API_KEY: "sk-...",
  VITE_GOOGLE_API_KEY: "AIza...",
  VITE_ANTHROPIC_API_KEY: "sk-ant...",
  VITE_JINA_API_KEY: "jina_..."
};
```

## 2. Docker Setup
Build the image once and run it anywhere.

```bash
# Build
docker build -t debate-trainer .

# Run
docker run -d \
  -p 3001:80 \
  --name debate-app \
  --restart unless-stopped \
  debate-trainer
```

## 3. Raspberry Pi & Auto-Updates
The project includes a GitHub Action that builds and pushes to Docker Hub.

**On the Pi:**
1.  Run **Watchtower** to handle auto-updates:
    ```bash
    docker run -d --name watchtower -v /var/run/docker.sock:/var/run/docker.sock -e DOCKER_API_VERSION=1.52 containrrr/watchtower --interval 300
    ```
2.  Run the app pointing to your Docker Hub repo:
    ```bash
    docker run -d -p 3001:80 --name debate-app --restart unless-stopped youruser/debate-trainer:latest
    ```

## 4. Cloudflare Tunnel
Expose the app safely without port forwarding.

```bash
cloudflared tunnel create debate-pi
cloudflared tunnel route dns debate-pi debate.yourdomain.com
cloudflared tunnel run --url http://localhost:3001 debate-pi
```

---

### Pro Tip: Dynamic Config
You can change API keys without rebuilding the Docker image by mounting a local `config.js`:
`docker run -v /path/to/config.js:/usr/share/nginx/html/config.js ...`