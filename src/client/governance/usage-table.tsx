import { translateUi, useUiLanguage } from "../i18n";
import { Table, Typography, type TableColumnsType } from "antd";
import type { ModelActivity } from "../../shared/governance";
const tokens = (value: number | null) =>
  value === null ? translateUi("Not recorded") : value.toLocaleString();
const money = (row: ModelActivity) =>
  row.costLow === null
    ? translateUi("Unavailable")
    : row.costHigh !== row.costLow
      ? `$${row.costLow.toFixed(4)}–$${row.costHigh!.toFixed(4)}`
      : `$${row.costLow.toFixed(4)}`;
export function GovernanceUsageTable({
  rows,
  byFunction = false,
}: {
  rows: ModelActivity[];
  byFunction?: boolean;
}) {
  useUiLanguage();
  const columns: TableColumnsType<ModelActivity> = [
    {
      title: byFunction ? translateUi("Model / function") : translateUi("Model"),
      dataIndex: "model",
      key: "model",
      width: 230,
      render: (_, row) => (
        <>
          <strong>{row.model}</strong>
          {byFunction && (
            <div className="governance-table-detail">
              {row.purpose && translateUi(row.purpose)}
              {row.cacheHits
                ? translateUi(" · {{value0}} cached summaries reused", { value0: row.cacheHits })
                : ""}
            </div>
          )}
        </>
      ),
    },
    {
      title: translateUi("Invocations"),
      dataIndex: "calls",
      key: "calls",
      width: 100,
      sorter: (a, b) => a.calls - b.calls,
    },
    {
      title: translateUi("Tools"),
      dataIndex: "tools",
      key: "tools",
      width: 70,
      sorter: (a, b) => a.tools - b.tools,
    },
    {
      title: translateUi("Input tokens"),
      dataIndex: "inputTokens",
      key: "inputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Output tokens"),
      dataIndex: "outputTokens",
      key: "outputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Cached input"),
      dataIndex: "cachedTokens",
      key: "cachedTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Cached output"),
      key: "cachedOutput",
      width: 110,
      render: () => translateUi("Not reported"),
    },
    {
      title: translateUi("Estimated USD"),
      key: "cost",
      width: 160,
      fixed: "right",
      render: (_, row) => (
        <>
          {money(row)}
          <div>
            <Typography.Text type="secondary" className="governance-table-detail">
              {translateUi(byFunction ? row.costBasis : "Known subtotal")}
            </Typography.Text>
          </div>
        </>
      ),
    },
  ];
  return (
    <Table<ModelActivity>
      className="governance-ant-table"
      columns={columns}
      dataSource={rows}
      rowKey={(row) => `${row.model}|${row.purpose}`}
      pagination={false}
      tableLayout="fixed"
      scroll={{ x: 1000 }}
      size="small"
      locale={{ emptyText: translateUi("No model activity recorded.") }}
    />
  );
}
