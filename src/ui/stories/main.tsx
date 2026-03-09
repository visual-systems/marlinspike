/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { render, useEffect, useState } from "@hono/hono/jsx/dom";
import * as AllStories from "./index.ts";

// ---------------------------------------------------------------------------
// Story registry
// ---------------------------------------------------------------------------

type StoryFn = () => unknown;

interface StoryGroup {
  title: string;
  stories: { name: string; fn: StoryFn }[];
}

function buildRegistry(): StoryGroup[] {
  return Object.entries(AllStories).map(([_key, module]) => {
    const mod = module as Record<string, unknown>;
    const title = (mod.meta as { title: string } | undefined)?.title ?? _key;
    const stories = Object.entries(mod)
      .filter(([name]) => name !== "meta")
      .map(([name, fn]) => ({ name, fn: fn as StoryFn }));
    return { title, stories };
  });
}

const registry = buildRegistry();

// ---------------------------------------------------------------------------
// Routing via hash
// ---------------------------------------------------------------------------

function parseHash(): { group: string; story: string } | null {
  const hash = location.hash.slice(1);
  const [group, story] = hash.split("/");
  return group && story ? { group, story } : null;
}

function toHash(group: string, story: string): string {
  return `#${group}/${story}`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [current, setCurrent] = useState<{ group: string; story: string } | null>(
    parseHash,
  );

  useEffect(() => {
    const onHashChange = () => setCurrent(parseHash());
    globalThis.addEventListener("hashchange", onHashChange);
    return () => globalThis.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(group: string, story: string) {
    location.hash = toHash(group, story);
  }

  const activeGroup = registry.find((g) => g.title === current?.group);
  const activeStory = activeGroup?.stories.find((s) => s.name === current?.story);

  return (
    <>
      <Sidebar current={current} onNavigate={navigate} />
      <StoryCanvas
        story={activeStory}
        key={current ? `${current.group}/${current.story}` : "none"}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar(
  { current, onNavigate }: {
    current: { group: string; story: string } | null;
    onNavigate: (group: string, story: string) => void;
  },
) {
  return (
    <div id="stories-sidebar">
      <div style="padding:12px 12px 6px; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#3a3a5a; border-bottom:1px solid #2a2a4a;">
        Stories
      </div>
      {registry.map((group) => (
        <div key={group.title}>
          <div style="padding:8px 12px 4px; font-size:11px; font-weight:600; color:#666; letter-spacing:0.05em;">
            {group.title}
          </div>
          {group.stories.map((story) => {
            const isActive = current?.group === group.title && current?.story === story.name;
            return (
              <StoryLink
                key={story.name}
                label={story.name}
                isActive={isActive}
                onClick={() => onNavigate(group.title, story.name)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StoryLink(
  { label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void },
) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={[
        "padding:4px 12px 4px 20px; font-size:12px; cursor:pointer;",
        isActive
          ? "color:#9090c0; background:#141428;"
          : hovered
          ? "color:#888; background:#111122;"
          : "color:#555;",
      ].join("")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story canvas
// ---------------------------------------------------------------------------

function StoryCanvas({ story }: { story: { name: string; fn: StoryFn } | undefined }) {
  if (!story) {
    return (
      <div
        id="stories-main"
        style="display:flex; align-items:center; justify-content:center; color:#3a3a5a; font-size:13px;"
      >
        Select a story from the sidebar
      </div>
    );
  }

  const Story = story.fn as unknown as () => JSX.Element;
  return (
    <div id="stories-main">
      <div style="font-size:11px; color:#3a3a5a; margin-bottom:16px; letter-spacing:0.05em;">
        {story.name}
      </div>
      <Story />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const root = document.getElementById("stories");
if (root) render(<App />, root);
