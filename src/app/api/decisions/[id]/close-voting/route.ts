import { requireUserId } from "@/lib/server/auth";
import { closeVoting } from "@/lib/server/decision-service";
import { handleError, json, requireDecisionId } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";

/** Organizer-only: close voting once more than half the group has voted. */
export async function POST(request: Request, ctx: RouteContext<"/api/decisions/[id]/close-voting">) {
  try {
    const decisionId = requireDecisionId((await ctx.params).id);
    const userId = await requireUserId(request);
    return json(await closeVoting(decisionId, userId));
  } catch (err) {
    return handleError(err);
  }
}
