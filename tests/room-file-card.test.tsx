import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileCard } from "@ant-design/x";
import { RoomChosenFile, RoomFilePick } from "../src/client/room/room-file-card";

const asset = { id: "a", originalName: "brief.pdf", kind: "", bytes: 1200 };
it("renders image attachments as compact named rows instead of large image cards", () => {
  const image = { ...asset, originalName: "reference.jpeg" };
  for (const markup of [
    renderToStaticMarkup(<RoomFilePick asset={image} picked={false} onToggle={() => {}} />),
    renderToStaticMarkup(<RoomChosenFile asset={image} onRemove={() => {}} />),
  ]) {
    expect(markup).toContain("room-image-file-card");
    expect(markup).toContain('src="/api/assets/a/preview"');
    expect(markup).toContain('width="48"');
    expect(markup).toContain('height="48"');
    expect(markup).toContain("reference");
    expect(markup).toContain(".jpeg");
    expect(markup).not.toContain("ant-file-card-image");
  }
});
it("deletes a shelf entry separately from selecting it", () => {
  const onToggle = vi.fn();
  const onDelete = vi.fn();
  const item = RoomFilePick({ asset, picked: false, onToggle, onDelete }) as ReactElement<{
    children: ReactElement<{ onClick: () => void }>[];
  }>;
  item.props.children[1].props.onClick();
  expect(onDelete).toHaveBeenCalledOnce();
  expect(onToggle).not.toHaveBeenCalled();
  const markup = renderToStaticMarkup(item);
  expect(markup).toContain('aria-label="Delete brief.pdf from shelf"');
  expect(markup).toMatch(/<button[^>]*aria-label="Delete brief.pdf from shelf"/);
});
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
