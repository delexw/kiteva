import { useCallback, useState, type ReactNode } from "react";
import { Virtuoso } from "react-virtuoso";
import type { ActivityDisplayRow } from "./activity-rows";

/** Use the room's existing scroll container; it remains the owner of live following. */
export function VirtualActivityRows<Row extends ActivityDisplayRow>({
  rows,
  renderRow,
}: {
  rows: Row[];
  renderRow: (row: Row) => ReactNode;
}) {
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setScrollParent(node?.closest<HTMLElement>(".room-project-scroll") ?? null);
  }, []);
  return (
    <div ref={containerRef} className="room-virtual-activity" data-row-count={rows.length}>
      {scrollParent && (
        <Virtuoso
          customScrollParent={scrollParent}
          data={rows}
          defaultItemHeight={80}
          increaseViewportBy={240}
          computeItemKey={(_index, row) => row.key}
          itemContent={(_index, row) => (
            <div
              className="room-virtual-activity-row"
              data-activity-row={row.key}
              style={{ paddingInlineStart: row.depth * 24 }}
            >
              {renderRow(row)}
            </div>
          )}
        />
      )}
    </div>
  );
}
