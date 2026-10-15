import { PageTemplate } from "./components/page-template";
import { useState } from "react";
import { Button, Card, Empty, Input, Select, Table, Tag, Typography, type TableColumnsType } from "antd";
import { Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Dialog } from "./dialog";
import { TechnologyCard } from "./components/technology-card";
import { technologyCardPath, filterTechnologyEntries, groupTechnologyEntries, technologyEntries, type TechnologyEntry } from "./technology-pool-model";

const readable = (value: string) => value.replaceAll("_", " ");
const kinds = [...new Set(technologyEntries.map((entry) => entry.kind))].sort();
const roles = [
  ...new Set(technologyEntries.flatMap((entry) => entry.definition.production_roles || [])),
].sort();
const columns: TableColumnsType<TechnologyEntry> = [
  {
    title: "Technology / pool key",
    key: "name",
    width: 210,
    sorter: (a, b) => a.definition.name.localeCompare(b.definition.name),
    render: (_, entry) => (
      <>
        <strong>
          <Link to={technologyCardPath(entry.key)}>{entry.definition.name}</Link>
        </strong>
        <div>
          <code>{entry.key}</code>
        </div>
      </>
    ),
  },
  {
    title: "Production roles",
    key: "roles",
    width: 150,
    render: (_, entry) => (
      <>
        {entry.definition.production_roles?.map((role) => (
          <Tag key={role}>{readable(role)}</Tag>
        ))}
      </>
    ),
  },
  {
    title: "Purpose",
    key: "purpose",
    width: 300,
    render: (_, entry) => (
      <Typography.Paragraph
        className="technology-purpose"
        ellipsis={{ rows: 2, tooltip: entry.definition.purpose }}
      >
        {entry.definition.purpose || "Not specified"}
      </Typography.Paragraph>
    ),
  },
  {
    title: "Package",
    key: "package",
    width: 140,
    render: (_, entry) =>
      entry.definition.package ? (
        <code>{entry.definition.package}</code>
      ) : (
        <span title="No package specified">—</span>
      ),
  },
];
export function TechnologyPoolPage() {
  const [params, setParams] = useSearchParams();
  const toolKey = params.get("tool");
  const selected = technologyEntries.find((entry) => entry.key === toolKey);
  function closeCard() {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("tool");
      return next;
    });
  }
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>();
  const [role, setRole] = useState<string>();
  const entries = filterTechnologyEntries(technologyEntries, query, kind, role);
  return (
    <PageTemplate
      className="technology-pool-page"
      eyebrow="Library / Technology pool"
      title="Technology pool."
      description={<p>Explore tools for styles, motion and production.</p>}
      actions={<Tag>{technologyEntries.length} technologies</Tag>}
      controls={
        <>
          <div className="technology-pool-controls">
            <Input
              aria-label="Search technologies"
              prefix={<Search size={16} />}
              placeholder="Search names, pool keys, packages or capabilities…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              allowClear
            />
            <Select
              aria-label="Technology type"
              value={kind}
              onChange={setKind}
              allowClear
              placeholder="All types"
              options={kinds.map((value) => ({ value, label: readable(value) }))}
            />
            <Select
              aria-label="Production role"
              value={role}
              onChange={setRole}
              allowClear
              placeholder="All roles"
              options={roles.map((value) => ({ value, label: readable(value) }))}
            />
          </div>
          <p className="technology-pool-count" role="status">
            {entries.length} of {technologyEntries.length} technologies
          </p>
        </>
      }
    >
      {!entries.length && <Empty description="No technologies match these filters." />}
      {groupTechnologyEntries(entries).map((group) => (
        <Card
          key={group.kind}
          data-technology-type={group.kind}
          className="technology-pool-table"
          title={readable(group.kind)}
          extra={
            <Tag>
              {group.entries.length} {group.entries.length === 1 ? "technology" : "technologies"}
            </Tag>
          }
        >
          <Table
            rowKey="key"
            columns={columns}
            dataSource={group.entries}
            pagination={false}
            size="small"
            tableLayout="fixed"
            scroll={{ x: 1000 }}
            locale={{ emptyText: "No technologies match these filters." }}
            expandable={{
              columnWidth: 40,
              expandedRowRender: (entry) => <TechnologyCard key={entry.key} entry={entry} />,
            }}
          />
        </Card>
      ))}
      {selected && (
        <Dialog title={selected.definition.name} onClose={closeCard} wide>
          <TechnologyCard key={selected.key} entry={selected} />
        </Dialog>
      )}
      {toolKey && !selected && (
        <div role="alert">
          Tool not found. <Button onClick={closeCard}>Back to technology pool</Button>
        </div>
      )}
    </PageTemplate>
  );
}
