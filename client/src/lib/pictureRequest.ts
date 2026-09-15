import { storyImagesOf, type StoryPicture } from "@shared/schema";
import { apiRequestAllowingErrors } from "./queryClient";
import { ApiError, errorMessageFor, isGatewayTimeout } from "./apiError";

/**
 * Ask for a picture, and do not mistake a slow one for a failed one.
 *
 * A picture drawn against a story's portraits, world sheet and cover takes
 * minutes (2m45s measured, 2026-09-15), and production sits behind Cloudflare,
 * which gives up on a request after 100 seconds and answers 524. The server
 * does NOT give up: Express finishes the handler after the socket closes, so
 * the picture is drawn, paid for and saved regardless. Reporting that as a
 * failure is worse than silence -- it invites a second press, and a second
 * picture nobody asked for.
 *
 * So: note which pictures the story has, send the request, and if it times out
 * at the proxy (or the connection drops), watch the story for a picture that
 * was not there before. Only when that also comes to nothing is it a failure,
 * and even then the message says to look in the gallery before trying again.
 */
export type PictureResult = { images: StoryPicture[]; imageUrl?: string };

const POLL_MS = 10_000;
const WAIT_MS = 6 * 60_000;

async function currentPictures(storyId: string): Promise<{ images: StoryPicture[]; imageUrl?: string } | undefined> {
  const res = await apiRequestAllowingErrors("GET", `/api/stories/${storyId}`).catch(() => undefined);
  if (!res?.ok) return undefined;
  const saved = await res.json().catch(() => undefined);
  if (!saved) return undefined;
  return { images: storyImagesOf(saved), imageUrl: (saved.story ?? saved).imageUrl };
}

export async function requestPicture(
  storyId: string,
  body: Record<string, unknown>,
  opts: { onStillDrawing?: () => void; sleep?: (ms: number) => Promise<void> } = {},
): Promise<PictureResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const before = await currentPictures(storyId);
  const known = new Set((before?.images ?? []).map((p) => p.id));

  let res: Response | undefined;
  try {
    res = await apiRequestAllowingErrors("POST", `/api/stories/${storyId}/illustrate`, body);
  } catch (error) {
    // fetch rejects with a TypeError only when the connection itself failed --
    // treated like a proxy timeout. Anything else is a bug, and is not hidden.
    if (!(error instanceof TypeError)) throw error;
    res = undefined;
  }
  if (res?.ok) return (await res.json()) as PictureResult;

  if (res && !isGatewayTimeout(res.status)) {
    const text = await res.text().catch(() => "");
    throw new ApiError(errorMessageFor(res.status, res.statusText, text), res.status);
  }

  // Timed out on the way back, not on the server. Wait for the picture itself.
  opts.onStillDrawing?.();
  for (let waited = 0; waited < WAIT_MS; waited += POLL_MS) {
    await sleep(POLL_MS);
    const now = await currentPictures(storyId);
    if (now && now.images.some((p) => !known.has(p.id))) return now;
  }
  throw new ApiError(
    "This picture is taking much longer than usual. It may still arrive -- look in the gallery in a few minutes before trying again, so it is not drawn twice.",
    res?.status ?? 0,
  );
}
