import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");
const arkCollectionPath = /^\/api\/ark\/api\/(?:plan\/)?v3\/contents\/generations\/tasks$/;
const arkTaskPath = /^\/api\/ark\/api\/(?:plan\/)?v3\/contents\/generations\/tasks\/[A-Za-z0-9_-]+$/;
const xaiCreatePath = /^\/api\/xai\/v1\/videos\/generations$/;
const xaiTaskPath = /^\/api\/xai\/v1\/videos\/[A-Za-z0-9_-]+$/;
const xaiModelsPath = /^\/api\/xai\/v1\/(?:models|video-generation-models)$/;

function arkProxyGuard(): Plugin {
    return {
        name: "sun-canvas-ark-proxy-guard",
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const pathname = new URL(request.url || "/", "http://localhost").pathname;
                if (!pathname.startsWith("/api/ark")) return next();
                const method = String(request.method || "GET").toUpperCase();
                const collection = arkCollectionPath.test(pathname);
                const task = arkTaskPath.test(pathname);
                if ((collection && method === "POST") || (task && method === "GET")) return next();

                response.statusCode = collection || task ? 405 : 404;
                if (collection || task) response.setHeader("Allow", collection ? "POST" : "GET");
                response.setHeader("Content-Type", "application/json; charset=utf-8");
                response.setHeader("Cache-Control", "no-store");
                response.setHeader("X-Sun-Canvas-Ark-Proxy", "1");
                response.end(JSON.stringify({ error: { message: collection || task ? "Method not allowed" : "Ark proxy route not found" } }));
            });
        },
    };
}

function xaiProxyGuard(): Plugin {
    return {
        name: "sun-canvas-xai-proxy-guard",
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const pathname = new URL(request.url || "/", "http://localhost").pathname;
                if (!pathname.startsWith("/api/xai")) return next();
                const method = String(request.method || "GET").toUpperCase();
                const create = xaiCreatePath.test(pathname);
                const task = xaiTaskPath.test(pathname);
                const models = xaiModelsPath.test(pathname);
                if (create ? method === "POST" : (task || models) && method === "GET") return next();

                response.statusCode = create || task || models ? 405 : 404;
                if (create || task || models) response.setHeader("Allow", create ? "POST" : "GET");
                response.setHeader("Content-Type", "application/json; charset=utf-8");
                response.setHeader("Cache-Control", "no-store");
                response.setHeader("X-Sun-Canvas-XAI-Proxy", "1");
                response.end(JSON.stringify({ error: { message: create || task || models ? "Method not allowed" : "xAI proxy route not found" } }));
            });
        },
    };
}

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [arkProxyGuard(), xaiProxyGuard(), react()],
    server: {
        proxy: {
            "/api/ark": {
                target: "https://ark.cn-beijing.volces.com",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api\/ark/, ""),
                configure(proxy) {
                    proxy.on("proxyReq", (proxyRequest) => {
                        proxyRequest.removeHeader("cookie");
                        proxyRequest.removeHeader("origin");
                        proxyRequest.removeHeader("referer");
                    });
                    proxy.on("proxyRes", (proxyResponse) => {
                        delete proxyResponse.headers["set-cookie"];
                        proxyResponse.headers["cache-control"] = "no-store";
                        proxyResponse.headers["x-sun-canvas-ark-proxy"] = "1";
                    });
                },
            },
            "/api/xai": {
                target: "https://api.x.ai",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api\/xai/, ""),
                configure(proxy) {
                    proxy.on("proxyReq", (proxyRequest) => {
                        proxyRequest.removeHeader("cookie");
                        proxyRequest.removeHeader("origin");
                        proxyRequest.removeHeader("referer");
                    });
                    proxy.on("proxyRes", (proxyResponse) => {
                        delete proxyResponse.headers["set-cookie"];
                        proxyResponse.headers["cache-control"] = "no-store";
                        proxyResponse.headers["x-sun-canvas-xai-proxy"] = "1";
                    });
                },
            },
        },
    },
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
});
