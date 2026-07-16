const XAI_ORIGIN = "https://api.x.ai";
const XAI_PROXY_PREFIX = "/api/xai";
const CREATE_PATH = /^\/v1\/videos\/generations$/;
const TASK_PATH = /^\/v1\/videos\/[A-Za-z0-9_-]+$/;
const MODEL_PATH = /^\/v1\/(?:models|video-generation-models)$/;

function jsonResponse(message: string, status: number, extraHeaders?: Record<string, string>) {
    return Response.json(
        { error: { message } },
        {
            status,
            headers: {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "X-Sun-Canvas-XAI-Proxy": "1",
                ...extraHeaders,
            },
        },
    );
}

export default {
    async fetch(request: Request) {
        const requestUrl = new URL(request.url);
        const upstreamPath = requestUrl.pathname.startsWith(XAI_PROXY_PREFIX) ? requestUrl.pathname.slice(XAI_PROXY_PREFIX.length) : "";
        const isCreate = CREATE_PATH.test(upstreamPath);
        const isTask = TASK_PATH.test(upstreamPath);
        const isModels = MODEL_PATH.test(upstreamPath);
        if (!isCreate && !isTask && !isModels) return jsonResponse("xAI proxy route not found", 404);

        const method = request.method.toUpperCase();
        const allowedMethod = isCreate ? "POST" : "GET";
        if (method !== allowedMethod) return jsonResponse("Method not allowed", 405, { Allow: allowedMethod });

        const headers = new Headers({ Accept: "application/json" });
        const authorization = request.headers.get("authorization");
        if (authorization) headers.set("Authorization", authorization);
        if (isCreate) headers.set("Content-Type", "application/json");

        try {
            const upstreamUrl = `${XAI_ORIGIN}${upstreamPath}${requestUrl.search}`;
            const upstream = await fetch(upstreamUrl, {
                method,
                headers,
                body: isCreate ? await request.arrayBuffer() : undefined,
                redirect: "manual",
            });
            const responseHeaders = new Headers({
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "X-Sun-Canvas-XAI-Proxy": "1",
            });
            const contentType = upstream.headers.get("content-type");
            const retryAfter = upstream.headers.get("retry-after");
            if (contentType) responseHeaders.set("Content-Type", contentType);
            if (retryAfter) responseHeaders.set("Retry-After", retryAfter);
            return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
        } catch {
            return jsonResponse("xAI upstream request failed", 502);
        }
    },
};
