import { NextResponse } from "next/server";
import { HttpError, requireUser } from "./auth";

type Handler = (user: { id: string; email: string; name: string }, req: Request) => Promise<unknown>;

// Wraps a route handler: requires login, returns JSON, maps errors to status codes.
export function route(handler: Handler) {
  return async (req: Request) => {
    try {
      const user = await requireUser();
      const result = await handler(user, req);
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
    }
  };
}
