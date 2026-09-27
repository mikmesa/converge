import { requireUserId } from "@/lib/server/auth";
import { getExplanation } from "@/lib/server/explain-service";
import { handleError, json, requireDecisionId } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Optional AI prose over the sanitized result. Never blocks results. */
export async function GET(request: Request, ctx: RouteContext<"/api/decisions/[id]/explanation">) {
  try {
    const decisionId = requireDecisionId((await ctx.params).id);
    const userId = await requireUserId(request);
    return json(await getExplanation(decisionId, userId));
  } catch (err) {
    return handleError(err);
  }
}
