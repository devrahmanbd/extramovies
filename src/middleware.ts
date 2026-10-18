import { defineMiddleware } from "astro:middleware";
import { legacyRouter } from "./lib/legacy/router";

export const onRequest = defineMiddleware((context, next) => {
  const legacy = legacyRouter.check(context.url.pathname);
  if (legacy) return legacy;
  return next();
});
