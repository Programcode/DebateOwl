# Deployment Guide

This app is optimized for Docker deployment, specifically targeting Raspberry Pi (ARM64) via Cloudflare Tunnels.

## Architecture
*   **Container:** Nginx serving static React build.
*   **Config:** Runtime injection via `config.js` (no build args needed).
*   **Exposure:** Cloudflare Tunnel (no port forwarding required).

---

## 1. Prepare Configuration
Create a `config.js` file with your production keys. Do NOT commit this to Git.

```javascript
// config.js
window.env = {
  VITE_OPENAI_API_KEY: "sk-...",
  VITE_GOOGLE_API_KEY: "AIza...",
  VITE_ANTHROPIC_API_KEY: "sk-ant..."
};
```

Ensure this file is located at `public/config.js` before building, or mount it into the container at `/usr/share/nginx/html/config.js`.

---

## 2. Deploy to Raspberry Pi

### Transfer Code
Send the project to your Pi (excluding heavy folders).
```bash
# Run on your Mac
tar --exclude=node_modules --exclude=dist --exclude=.git -czf debate-trainer.tar.gz .
scp debate-trainer.tar.gz user@raspberrypi.local:~/
```

### Build & Run (On Pi)
SSH into your Pi and run:
```bash
ssh user@raspberrypi.local

# Unpack
mkdir -p ~/debate-trainer
tar -xzf debate-trainer.tar.gz -C ~/debate-trainer
cd ~/debate-trainer

# Build (Takes ~5 mins on Pi 4)
docker build -t debate-trainer .

# Run
# We use port 3001 to avoid conflicts with old instances
docker rm -f debate-app || true
docker run -d -p 3001:80 --name debate-app --restart unless-stopped debate-trainer
```

---

## 3. Expose via Cloudflare Tunnel

Run these commands **on the Raspberry Pi**.

1.  **Install Cloudflared:**
    ```bash
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
    sudo dpkg -i cloudflared.deb
    ```

2.  **Authenticate:**
    ```bash
    cloudflared tunnel login
    ```
    *Copy the URL, authorize on your Mac.*

3.  **Create Tunnel:**
    ```bash
    cloudflared tunnel create debate-pi
    ```

4.  **Route DNS:**
    ```bash
    # Replace with your domain
    cloudflared tunnel route dns debate-pi debate.yourdomain.com
    ```

5.  **Run Tunnel:**
    ```bash
    cloudflared tunnel run --url http://localhost:3001 debate-pi
    ```

    *To run as a service (start on boot):*
    ```bash
    sudo cloudflared service install
    ```

---

## Troubleshooting

*   **"System Key Not Found":** Ensure `public/config.js` has the correct keys and structure (`window.env = { ... }`).
*   **Port Conflict:** If port 3001 is taken, change the `-p 3001:80` part of the docker run command.
*   **Tunnel Error:** Ensure you aren't running multiple tunnels with the same name. use `cloudflared tunnel list` to check.
