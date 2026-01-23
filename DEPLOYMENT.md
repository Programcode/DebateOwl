# Deployment Guide: Docker + Cloudflare Tunnel

This guide explains how to take your Debate Trainer application, containerize it with Docker, and securely expose it to the internet using a Cloudflare Tunnel.

---

## Part 1: Build & Run the Container

First, we need to package your app into a running server.

1.  **Build the Image**
    Open your terminal in the project root and run:
    ```bash
    docker build -t debate-trainer .
    ```
    *(This may take a few minutes the first time as it downloads Node and builds your app)*

2.  **Run the Container**
    We will run the container and map it to port **3000** on your machine.
    ```bash
    docker run -d -p 3000:80 --name debate-app --restart unless-stopped debate-trainer
    ```

3.  **Verify it's working**
    Open [http://localhost:3000](http://localhost:3000) in your browser. You should see your app running smoothly!

---

## Part 2: Cloudflare Tunnel (The "Public Link")

Now we connect that running container to your actual domain name.

### Prerequisites
*   A Cloudflare account.
*   A domain added to your Cloudflare account.
*   `cloudflared` installed on your host machine (or run as another docker container).

### Option A: Using the CLI (Quickest)

1.  **Login to Cloudflare**
    ```bash
    cloudflared tunnel login
    ```
    *This opens a browser window. Select your domain to authorize.*

2.  **Create a Tunnel**
    ```bash
    cloudflared tunnel create debate-tunnel
    ```
    *Copy the Tunnel ID it gives you (e.g., `89b3...`).*

3.  **Route DNS**
    Tell Cloudflare "when someone visits `debate.yourdomain.com`, use this tunnel".
    ```bash
    cloudflared tunnel route dns debate-tunnel debate.yourdomain.com
    ```

4.  **Run the Tunnel**
    Connect the tunnel to your local Docker app running on port 3000.
    ```bash
    cloudflared tunnel run --url http://localhost:3000 debate-tunnel
    ```

**Success!** Your app is now live at `https://debate.yourdomain.com`.

---

### Option B: Using Docker Compose (The "Pro" Way)

This method runs *both* your app and the tunnel together in Docker. This is cleaner because you don't need to install `cloudflared` on your machine manually.

1.  **Get your Token**
    *   Go to Cloudflare Dashboard > Zero Trust > Tunnels.
    *   Create a new tunnel, choose "Docker", and copy the **token** (a long string starting with `ey...`).

2.  **Create `docker-compose.yml`**
    Create a file named `docker-compose.yml` in your project folder:

    ```yaml
    version: '3'
    services:
      # Your App
      app:
        build: .
        container_name: debate-app
        restart: unless-stopped
        # No ports needed! The tunnel talks to it internally.

      # The Tunnel
      tunnel:
        image: cloudflare/cloudflared
        restart: unless-stopped
        command: tunnel run
        environment:
          - TUNNEL_TOKEN=YOUR_LONG_TOKEN_HERE
    ```

3.  **Deploy**
    ```bash
    docker-compose up -d
    ```

4.  **Configure Service**
    *   Go back to the Cloudflare Dashboard.
    *   In your Tunnel settings > "Public Hostname".
    *   **Public Hostname:** `debate.yourdomain.com`
    *   **Service:** `http://app:80`  <-- Note: "app" matches the service name in yaml!

---

## Troubleshooting

*   **App not loading locally?**
    Check if port 3000 is taken. Try `docker run -p 3001:80 ...` and check `localhost:3001`.
*   **"Bad Gateway" (502) on domain?**
    Cloudflare can't reach your app.
    *   If using **CLI**: Ensure you pointed to `http://localhost:3000`.
    *   If using **Docker Compose**: Ensure you pointed to `http://app:80`.
*   **Updates?**
    If you change code, you must rebuild:
    ```bash
    docker build -t debate-trainer .
    docker rm -f debate-app
    docker run -d -p 3000:80 --name debate-app debate-trainer
    ```
