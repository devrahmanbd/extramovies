import { defineMiddleware } from "astro:middleware";
import { legacyRouter } from "./lib/legacy/router";
import { resolveRequest } from "./lib/http/canonical-host";

export const onRequest = defineMiddleware((context, next) => {
  // Host first: a `www.` copy of the brand's domain is a duplicate host
  // and the answer is a redirect whatever the path is. Then the legacy
  // archive answers path-level (301 mapped, 410 gone).
  const answered = resolveRequest(context.request, context.url, (pathname) =>
    legacyRouter.check(pathname),
  );
  if (answered) return answered;
  return next();
});
