const ARK_ORIGIN = "https://ark.cn-beijing.volces.com";
const ARK_PROXY_PREFIX = "/api/ark";
const CREATE_PATH = /^\/api\/(?:plan\/)?v3\/contents\/generations\/tasks$/;
const TASK_PATH = /^\/api\/(?:plan\/)?v3\/contents\/generations\/tasks\/[A-Za-z0-9_-]+$/;

function jsonResponse(message: string, status: number, extraHeaders?: Record<string, string>) {
    return Response.json(
        { error: { message } },
        {
            status,
            headers: {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "X-Sun-Canvas-Ark-Proxy": "1",
                ...extraHeaders,
            },
        },
    );
}

export default {
    async fetch(request: Request) {
        const requestUrl = new URL(request.url);
        const upstreamPath = requestUrl.pathname.startsWith(ARK_PROXY_PREFIX) ? requestUrl.pathname.slice(ARK_PROXY_PREFIX.length) : "";
        const isCreate = CREATE_PATH.test(upstreamPath);
        const isTask = TASK_PATH.test(upstreamPath);
        if (!isCreate && !isTask) return jsonResponse("Ark proxy route not found", 404);

        const method = request.method.toUpperCase();
        const allowedMethod = isCreate ? "POST" : "GET";
        if (method !== allowedMethod) return jsonResponse("Method not allowed", 405, { Allow: allowedMethod });

        const headers = new Headers({ Accept: "application/json" });
        const authorization = request.headers.get("authorization");
        if (authorization) headers.set("Authorization", authorization);
        if (isCreate) headers.set("Content-Type", "application/json");

        try {
            const upstreamUrl = `${ARK_ORIGIN}${upstreamPath}${requestUrl.search}`;
            const upstream = await fetch(upstreamUrl, {
                method,
                headers,
                body: isCreate ? await request.arrayBuffer() : undefined,
                redirect: "manual",
            });
            const responseHeaders = new Headers({
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "X-Sun-Canvas-Ark-Proxy": "1",
            });
            const contentType = upstream.headers.get("content-type");
            const retryAfter = upstream.headers.get("retry-after");
            if (contentType) responseHeaders.set("Content-Type", contentType);
            if (retryAfter) responseHeaders.set("Retry-After", retryAfter);
            return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
        } catch {
            return jsonResponse("Ark upstream request failed", 502);
        }
    },
};
