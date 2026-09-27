import { requireUserId } from "@/lib/server/auth";
import { getResults } from "@/lib/server/decision-service";
import { handleError, json, requireDecisionId } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";

/** Sanitized results for the calling participant (403 before reveal). */
export async function GET(request: Request, ctx: RouteContext<"/api/decisions/[id]/results">) {
  try {
    const decisionId = requireDecisionId((await ctx.params).id);
    const userId = await requireUserId(request);
    return json(await getResults(decisionId, userId));
  } catch (err) {
    return handleError(err);
  }
}
