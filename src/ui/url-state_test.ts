import { assertEquals } from "@std/assert";
import { parseHash, serializeHash, type UrlState } from "./url-state.ts";

Deno.test("parseHash: empty hash returns null", () => {
  assertEquals(parseHash(""), null);
  assertEquals(parseHash("#"), null);
  assertEquals(parseHash("#/"), null);
});

Deno.test("parseHash: profile + workspace only", () => {
  assertEquals(parseHash("#/prof-1/ws-2"), {
    profileId: "prof-1",
    workspaceId: "ws-2",
    focusId: null,
    selection: null,
  });
});

Deno.test("parseHash: profile + workspace + focus", () => {
  assertEquals(parseHash("#/prof-1/ws-2/focus-3"), {
    profileId: "prof-1",
    workspaceId: "ws-2",
    focusId: "focus-3",
    selection: null,
  });
});

Deno.test("parseHash: _ focus means null", () => {
  assertEquals(parseHash("#/prof-1/ws-2/_"), {
    profileId: "prof-1",
    workspaceId: "ws-2",
    focusId: null,
    selection: null,
  });
});

Deno.test("parseHash: full with selection", () => {
  assertEquals(parseHash("#/prof-1/ws-2/focus-3/node:abc"), {
    profileId: "prof-1",
    workspaceId: "ws-2",
    focusId: "focus-3",
    selection: { type: "node", id: "abc" },
  });
});

Deno.test("parseHash: edge selection", () => {
  assertEquals(parseHash("#/prof-1/ws-2/_/edge:e1"), {
    profileId: "prof-1",
    workspaceId: "ws-2",
    focusId: null,
    selection: { type: "edge", id: "e1" },
  });
});

Deno.test("parseHash: constraint selection", () => {
  assertEquals(parseHash("#/prof-1/ws-2/f/constraint:c1"), {
    profileId: "prof-1",
    workspaceId: "ws-2",
    focusId: "f",
    selection: { type: "constraint", id: "c1" },
  });
});

Deno.test("parseHash: invalid selection type ignored", () => {
  assertEquals(parseHash("#/prof-1/ws-2/f/bogus:x"), {
    profileId: "prof-1",
    workspaceId: "ws-2",
    focusId: "f",
    selection: null,
  });
});

Deno.test("parseHash: single segment returns null", () => {
  assertEquals(parseHash("#/prof-1"), null);
});

Deno.test("serializeHash: profile + workspace", () => {
  const state: UrlState = {
    profileId: "p",
    workspaceId: "w",
    focusId: null,
    selection: null,
  };
  assertEquals(serializeHash(state), "#/p/w");
});

Deno.test("serializeHash: with focus", () => {
  const state: UrlState = {
    profileId: "p",
    workspaceId: "w",
    focusId: "f",
    selection: null,
  };
  assertEquals(serializeHash(state), "#/p/w/f");
});

Deno.test("serializeHash: with selection but no focus", () => {
  const state: UrlState = {
    profileId: "p",
    workspaceId: "w",
    focusId: null,
    selection: { type: "node", id: "n1" },
  };
  assertEquals(serializeHash(state), "#/p/w/_/node:n1");
});

Deno.test("serializeHash: with focus and selection", () => {
  const state: UrlState = {
    profileId: "p",
    workspaceId: "w",
    focusId: "f",
    selection: { type: "edge", id: "e1" },
  };
  assertEquals(serializeHash(state), "#/p/w/f/edge:e1");
});

Deno.test("round-trip: full state", () => {
  const state: UrlState = {
    profileId: "abc-123",
    workspaceId: "def-456",
    focusId: "ghi-789",
    selection: { type: "constraint", id: "c-1" },
  };
  assertEquals(parseHash(serializeHash(state)), state);
});

Deno.test("round-trip: minimal state", () => {
  const state: UrlState = {
    profileId: "p",
    workspaceId: "w",
    focusId: null,
    selection: null,
  };
  assertEquals(parseHash(serializeHash(state)), state);
});

Deno.test("round-trip: focus only", () => {
  const state: UrlState = {
    profileId: "p",
    workspaceId: "w",
    focusId: "f",
    selection: null,
  };
  assertEquals(parseHash(serializeHash(state)), state);
});

Deno.test("round-trip: selection without focus", () => {
  const state: UrlState = {
    profileId: "p",
    workspaceId: "w",
    focusId: null,
    selection: { type: "node", id: "x" },
  };
  assertEquals(parseHash(serializeHash(state)), state);
});
