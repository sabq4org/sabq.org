import os from "node:os";
import path from "node:path";
import { createServer } from "vite";

/** Local synthetic fixture only; never connects to the application backend. */
export async function createNewsSkillsPreview(port = 0) {
  const root = process.cwd();
  const server = await createServer({
    configFile: path.join(root, "vite.config.ts"),
    root,
    cacheDir: path.join(os.tmpdir(), `sabq-news-vite-${process.pid}-${port}`),
    server: { host: "127.0.0.1", port, strictPort: port !== 0 },
    plugins: [{
      name: "news-skills-local-route",
      configureServer(vite) {
        vite.middlewares.use((req, _res, next) => {
          if (req.url === "/news" || req.url?.startsWith("/news?")) {
            req.url = `/e2e/fixtures/news-skills.html${req.url.slice(5)}`;
          }
          next();
        });
      },
    }],
  });
  await server.listen();
  return server;
}
