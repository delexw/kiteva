import { Flex, Progress } from "antd";
import {
  activityProgressPercent,
  activityText,
  type DisplayActivityItem,
} from "../activity-display";

/** Shared progress indicator within Ant Design X activity steps. */
export function ActivityProgress({ item }: { item?: DisplayActivityItem }) {
  const percent = item && activityProgressPercent(item);
  if (percent === undefined) return null;
  return (
    <Progress
      percent={Math.floor(percent)}
      showInfo
      format={(value) => `${value}%`}
      classNames={{ indicator: "activity-progress-percent" }}
      style={{ width: 160, minWidth: 96, margin: 0 }}
      size="small"
      status={item?.status === "failed" ? "exception" : percent >= 100 ? "success" : "active"}
    />
  );
}

/** Keep label, progress bar and percentage in the same parent title row. */
export function ActivityWorkTitle({ item, label }: { item?: DisplayActivityItem; label?: string }) {
  const percent = item && activityProgressPercent(item);
  return (
    <Flex
      component="span"
      className="activity-work-title"
      align="center"
      gap={8}
      style={{ minWidth: 0, maxWidth: "100%" }}
    >
      <span
        style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {label ?? (item ? activityText(item) : "")}
      </span>
      {percent !== undefined && (
        <>
          <span aria-hidden="true"> · </span>
          <ActivityProgress item={item} />
        </>
      )}
    </Flex>
  );
}
