/**
 * Pasted images: the Markdown they read and write as, the type check on their first bytes,
 * and the two routes that keep and serve them, with no database (see support/fake-db.mts).
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installFakeDb } from "./support/fake-db.mts";

const db = installFakeDb();

process.env.NOTES_SESSION_SECRET = "a-throwaway-secret-for-tests-only";
const { createSessionValue, SESSION_COOKIE } = await import("@/lib/session");

// The routes read the session cookie through next/headers, which needs a running server.
let cookieValue: string | undefined;
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE && cookieValue ? { value: cookieValue } : undefined) }),
}));

const { POST } = await import("@/app/api/images/route");
const { GET } = await import("@/app/api/images/[id]/route");
const { purgeOrphanImages } = await import("@/lib/db");
const { fromMarkdown, toMarkdown } = await import("@/lib/markdown");
const { sniffImageType, MAX_IMAGE_BYTES } = await import("@/lib/images");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ID = "0a1b2c3d-0000-4000-8000-123456789abc";

function upload(body: BodyInit | null, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://notes.test/api/images", {
      method: "POST",
      body,
      headers: { origin: "http://notes.test", host: "notes.test", "content-type": "image/png", ...headers },
    }) as never
  );
}

const get = (id: string) => GET(new Request(`http://notes.test/api/images/${id}`) as never, { params: Promise.resolve({ id }) });

beforeEach(async () => {
  db.reset();
  cookieValue = await createSessionValue();
});

describe("image Markdown", () => {
  test("an image line reads and writes back unchanged", () => {
    const md = `Before\n\n![A \\[cat\\] pic](/api/images/${ID})\n\nAfter`;
    const doc = fromMarkdown(md);
    expect(doc.content?.[1]).toEqual({ type: "noteImage", attrs: { src: `/api/images/${ID}`, alt: "A [cat] pic" } });
    expect(toMarkdown(doc)).toBe(md);
  });

  test("an image from another site is never turned into an image block", () => {
    const doc = fromMarkdown("![x](https://evil.test/a.png)");
    expect(JSON.stringify(doc)).not.toContain("noteImage");
  });

  test("the site's own origin in front still reads as an image", () => {
    const doc = fromMarkdown(`![](https://notes.example.com/api/images/${ID})`);
    expect(doc.content?.[0].type).toBe("noteImage");
    expect(doc.content?.[0].attrs?.src).toBe(`/api/images/${ID}`);
  });
});

describe("sniffImageType", () => {
  test("knows the four allowed types by their first bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("GIF89a...."))).toBe("image/gif");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });
  test("refuses SVG, HTML and anything else", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("POST /api/images and GET /api/images/<id>", () => {
  test("keeps an image and serves the same bytes back, locked down", async () => {
    const created = await upload(PNG);
    expect(created.status).toBe(201);
    const { url } = (await created.json()) as { url: string };
    expect(url).toMatch(/^\/api\/images\/[0-9a-f-]{36}$/);

    const served = await get(url.split("/").pop()!);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("content-security-policy")).toContain("sandbox");
    expect(served.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
  });

  test("the type comes from the bytes, not from what the browser says", async () => {
    const created = await upload(PNG, { "content-type": "image/jpeg" });
    const { url } = (await created.json()) as { url: string };
    expect((await get(url.split("/").pop()!)).headers.get("content-type")).toBe("image/png");
    expect((await upload(new TextEncoder().encode("<svg/>"), { "content-type": "image/png" })).status).toBe(415);
  });

  test("needs a signed-in browser, both ways", async () => {
    const created = await upload(PNG);
    const id = ((await created.json()) as { url: string }).url.split("/").pop()!;
    cookieValue = undefined;
    expect((await upload(PNG)).status).toBe(401);
    expect((await get(id)).status).toBe(401);
    expect(db.images).toHaveLength(1);
  });

  test("refuses a post from another site, an empty body and an oversize one", async () => {
    expect((await upload(PNG, { origin: "http://evil.test" })).status).toBe(403);
    expect((await upload(new Uint8Array())).status).toBe(400);
    expect((await upload(new Uint8Array(MAX_IMAGE_BYTES + 1))).status).toBe(413);
    expect(db.images).toHaveLength(0);
  });

  test("an unknown or malformed id is a 404", async () => {
    expect((await get(ID)).status).toBe(404);
    expect((await get("not-an-id")).status).toBe(404);
  });
});

describe("purgeOrphanImages", () => {
  test("clears old images no page names, and keeps the rest", async () => {
    const make = async () => ((await (await upload(PNG)).json()) as { url: string }).url.split("/").pop()!;
    const [used, unused, fresh] = [await make(), await make(), await make()];
    for (const row of db.images) if (row.id !== fresh) row.old = true;
    db.pages.push({
      id: crypto.randomUUID(), parent_id: null, title: "p", icon: null, position: 1,
      content: { type: "doc", content: [{ type: "noteImage", attrs: { src: `/api/images/${used}` } }] },
      created_at: new Date(), updated_at: new Date(), deleted_at: new Date(), mcp_editor: null, mcp_edited_at: null,
    });
    await purgeOrphanImages();
    expect(db.images.map((row) => row.id).sort()).toEqual([used, fresh].sort());
    expect(db.images.some((row) => row.id === unused)).toBe(false);
  });
});
