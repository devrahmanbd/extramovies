import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { siteOrigin } from "../src/lib/seo/meta";

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SITE_URL;
});

afterEach(() => {
  if (saved === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = saved;
});

describe("siteOrigin", () => {
  it("prefers a valid SITE_URL over the request origin", () => {
    process.env.SITE_URL = "https://extramovies.org/";
    expect(siteOrigin("http://127.0.0.1:3100")).toBe("https://extramovies.org");
  });

  it("falls back to the request origin when SITE_URL is unset", () => {
    delete process.env.SITE_URL;
    expect(siteOrigin("http://127.0.0.1:4321")).toBe("http://127.0.0.1:4321");
  });

  it("rejects non-origin SITE_URL values (path, garbage, empty)", () => {
    for (const bad of ["", "not-a-url", "https://example.com/sub", "ftp://x"]) {
      process.env.SITE_URL = bad;
      expect(siteOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    }
  });
});
