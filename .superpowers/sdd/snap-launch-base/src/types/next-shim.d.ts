/**
 * Minimal Next.js type shim so `import type { ... } from "next"` passes tsc
 * without installing Next.js. Astro is the runtime; these types exist only
 * for the legacy (req, res) handler signatures kept for vitest compat.
 */
declare module "next" {
  export interface NextApiRequest {
    method?: string;
    headers: Record<string, string | string[] | undefined> & {
      cookie?: string;
    };
    cookies?: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
    body?: unknown;
    socket?: { remoteAddress?: string };
    [key: string]: unknown;
  }

  export interface NextApiResponse {
    status(code: number): NextApiResponse;
    json(body: unknown): unknown;
    send?(body: unknown): unknown;
    setHeader(name: string, value: string | string[]): void;
    [key: string]: unknown;
  }

  export interface GetServerSidePropsContext {
    req: NextApiRequest;
    res: NextApiResponse;
    query: Record<string, string | string[] | undefined>;
    params?: Record<string, string | string[] | undefined>;
    resolvedUrl: string;
    [key: string]: unknown;
  }

  export type GetServerSidePropsResult<P> =
    | { props: P }
    | { redirect: { destination: string; permanent: boolean } }
    | { notFound: true };

  export type GetServerSideProps<P = Record<string, unknown>> = (
    ctx: GetServerSidePropsContext,
  ) => Promise<GetServerSidePropsResult<P>>;
}

declare module "next/link" {
  import type * as React from "react";
  const Link: React.ComponentType<
    React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
      children?: React.ReactNode;
    }
  >;
  export default Link;
}

declare module "next/router" {
  export function useRouter(): {
    push(url: string): void | Promise<unknown>;
    replace(url: string): void | Promise<unknown>;
    pathname: string;
    query: Record<string, string | string[] | undefined>;
  };
}
