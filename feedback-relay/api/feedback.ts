import { handleFeedback } from "../lib/relay";

/** POST /api/feedback, called by Study Squad servers. */
export function POST(request: Request): Promise<Response> {
  return handleFeedback(request, process.env);
}
