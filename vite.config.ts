import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

function bundleGraph(): Plugin {
  return {
    name: 'bundle-graph',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.fromEntries(Object.values(bundle)
        .filter((output) => output.type === 'chunk')
        .map((chunk) => [chunk.fileName, {
          imports: chunk.imports,
          modules: Object.keys(chunk.modules),
        }]));
      this.emitFile({
        type: 'asset',
        fileName: '.vite/bundle-graph.json',
        source: JSON.stringify(chunks, null, 2),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'capacitor' ? './' : '/',
  server: {
    host: "::",
    port: Number(process.env.PORT) || 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), bundleGraph()],
  optimizeDeps: {
    // Narrows dev prebundling to the SPA entry. Without this, Vite crawls all
    // 84 HTML files under the root, including the prerendered pages in public/.
    entries: ['index.html'],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    manifest: true,
    chunkSizeWarningLimit: 700,
  },
}));
