import { expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileCard } from "@ant-design/x";
import { RoomChosenFile, RoomFilePick } from "../src/client/room/room-file-card";

const asset = { id: "a", originalName: "brief.pdf", kind: "", bytes: 1200 };
it("gives shelf picks and chosen-file removal real labelled, focusable controls", () => {
  const pick = renderToStaticMarkup(
    <RoomFilePick asset={asset} picked={false} onToggle={() => {}} />,
  );
  expect(pick).toMatch(/role="button"/);
  expect(pick).toMatch(/tabindex="0"/);
  expect(pick).toMatch(/aria-pressed="false"/);
  expect(pick).toContain('aria-label="Add brief.pdf"');
  expect(renderToStaticMarkup(<RoomFilePick asset={asset} picked onToggle={() => {}} />)).toContain(
    'aria-label="Remove brief.pdf"',
  );
  const chosen = renderToStaticMarkup(<RoomChosenFile asset={asset} onRemove={() => {}} />);
  expect(chosen).toMatch(/<button[^>]*aria-label="Remove brief.pdf"/);
  expect(renderToStaticMarkup(<RoomChosenFile asset={asset} />)).not.toContain("<button");
});

it("picks image, audio and document shelf files exactly once per click or key press", () => {
  for (const originalName of ["frame.jpg", "theme.wav", "notes.txt"]) {
    let toggles = 0;
    const pick = RoomFilePick({
      asset: { ...asset, originalName },
      picked: false,
      onToggle: () => toggles++,
    }) as ReactElement<{
      onClick: () => void;
      onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
      children: ReactElement<Record<string, unknown>>;
    }>;
    const card = pick.props.children;
    expect(isValidElement(card) && card.type).toBe(FileCard);
    expect(card.props).not.toHaveProperty("onClick");
    expect(card.props).not.toHaveProperty("role");
    pick.props.onClick();
    expect(toggles).toBe(1);
    let prevented = 0;
    for (const key of ["Enter", " ", "Tab"])
      pick.props.onKeyDown({ key, preventDefault: () => prevented++ });
    expect([toggles, prevented]).toEqual([3, 2]);
  }
  const image = renderToStaticMarkup(
    <RoomFilePick asset={{ ...asset, originalName: "frame.jpg" }} picked onToggle={() => {}} />,
  );
  expect(image).toMatch(
    /<div class="room-shelf-pick is-picked" role="button" tabindex="0" aria-pressed="true"/,
  );
  expect(image).not.toContain("ant-image-mask");
});
