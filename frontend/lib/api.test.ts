import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch, buildQuery } from "@/lib/api";

function mockResponse({
  ok = true,
  status = 200,
  payload = {},
  contentType = "application/json",
}: {
  ok?: boolean;
  status?: number;
  payload?: unknown;
  contentType?: string;
} = {}) {
  return {
    ok,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
    json: async () => payload,
    text: async () => String(payload),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildQuery", () => {
  it("omits empty values and encodes the rest", () => {
    expect(buildQuery({ q: "iphone 15", page: 1, empty: "", missing: undefined, flag: false })).toBe(
      "?q=iphone+15&page=1&flag=false",
    );
  });

  it("returns an empty string when nothing is set", () => {
    expect(buildQuery({})).toBe("");
  });
});

describe("apiFetch", () => {
  it("adds JSON and bearer headers when required", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ payload: { status: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ status: string }>("/api/test", {
      method: "POST",
      token: "token-123",
      body: { hello: "world" },
    });

    expect(result.status).toBe("ok");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer token-123");
    expect(init.body).toBe('{"hello":"world"}');
  });

  it("surfaces FastAPI validation details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 422,
          payload: { detail: [{ msg: "Email is invalid" }, { msg: "Password is too short" }] },
        }),
      ),
    );

    await expect(apiFetch("/api/test")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "Email is invalid, Password is too short",
    });
  });

  it("wraps network failures as status zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const error = await apiFetch("/api/test").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toBe("offline");
  });
});
