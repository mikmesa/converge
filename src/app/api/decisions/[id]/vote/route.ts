import { isUuid, requireUserId } from "@/lib/server/auth";
import { castVote } from "@/lib/server/decision-service";
import { ApiError } from "@/lib/server/errors";
import { handleError, json, requireDecisionId } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";

/** Cast or change the caller's own (blind) vote. */
export async function POST(request: Request, ctx: RouteContext<"/api/decisions/[id]/vote">) {
  try {
    const decisionId = requireDecisionId((await ctx.params).id);
    const userId = await requireUserId(request);
    const body = (await request.json().catch(() => null)) as { optionId?: unknown } | null;
    if (!body || !isUuid(body.optionId)) throw new ApiError("invalid_request");
    return json(await castVote(decisionId, userId, body.optionId.toLowerCase()));
  } catch (err) {
    return handleError(err);
  }
}
