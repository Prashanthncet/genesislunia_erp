import { NextRequest } from "next/server";
import { proxyToNestBackend } from "@/lib/bff-proxy";
import { POST as handleRpcPost } from "../_rpc/route";

type RouteContext = { params: Promise<{ path: string[] }> };

async function handleProxy(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  const subPath = Array.isArray(path) ? path.join("/") : "";
  if (subPath === "_rpc" && req.method.toUpperCase() === "POST") {
    return handleRpcPost(req);
  }
  const search = req.nextUrl.search || "";
  const targetPath = `/api/${subPath}${search}`;
  const method = req.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await req.arrayBuffer() : null;

  return proxyToNestBackend(req, {
    targetPath,
    method,
    body,
  });
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
