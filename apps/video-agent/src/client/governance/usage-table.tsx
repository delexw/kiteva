import { Table, Typography, type TableColumnsType } from "antd";
import type { ModelActivity } from "../../shared/governance";
const tokens = (value: number | null) => (value === null ? "Not recorded" : value.toLocaleString());
const money = (row: ModelActivity) =>
  row.costLow === null
    ? "Unavailable"
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
  const columns: TableColumnsType<ModelActivity> = [
    {
      title: byFunction ? "Model / function" : "Model",
      dataIndex: "model",
      key: "model",
      width: 230,
      render: (_, row) => (
        <>
          <strong>{row.model}</strong>
          {byFunction && (
            <div className="governance-table-detail">
              {row.purpose}
              {row.cacheHits ? ` · ${row.cacheHits} cached summaries reused` : ""}
            </div>
          )}
        </>
      ),
    },
    {
      title: "Invocations",
      dataIndex: "calls",
      key: "calls",
      width: 100,
      sorter: (a, b) => a.calls - b.calls,
    },
    {
      title: "Tools",
      dataIndex: "tools",
      key: "tools",
      width: 70,
      sorter: (a, b) => a.tools - b.tools,
    },
    {
      title: "Input tokens",
      dataIndex: "inputTokens",
      key: "inputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: "Output tokens",
      dataIndex: "outputTokens",
      key: "outputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: "Cached input",
      dataIndex: "cachedTokens",
      key: "cachedTokens",
      width: 110,
      render: tokens,
    },
    { title: "Cached output", key: "cachedOutput", width: 110, render: () => "Not reported" },
    {
      title: "Estimated USD",
      key: "cost",
      width: 160,
      fixed: "right",
      render: (_, row) => (
        <>
          {money(row)}
          <div>
            <Typography.Text type="secondary" className="governance-table-detail">
              {byFunction ? row.costBasis : "Known subtotal"}
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
      locale={{ emptyText: "No model activity recorded." }}
    />
  );
}
