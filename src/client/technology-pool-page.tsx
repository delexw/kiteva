import { translateUi, useUiLanguage } from "./i18n";
import { PageTemplate } from "./components/page-template";
import { useState } from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from "antd";
import { Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Dialog } from "./dialog";
import { TechnologyCard } from "./components/technology-card";
import {
  technologyCardPath,
  filterTechnologyEntries,
  groupTechnologyEntries,
  technologyEntries,
  type TechnologyEntry,
} from "./technology-pool-model";

const readable = (value: string) => translateUi(value);
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
          <Link to={technologyCardPath(entry.key)}>{translateUi(entry.definition.name)}</Link>
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
        ellipsis={{ rows: 2, tooltip: translateUi(entry.definition.purpose ?? "Not specified") }}
      >
        {translateUi(entry.definition.purpose || "Not specified")}
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
        <span title={translateUi("No package specified")}>—</span>
      ),
  },
];
export function TechnologyPoolPage() {
  useUiLanguage();
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
      title={translateUi("Technology pool.")}
      description={
        <p>{translateUi("Explore tools for Motion Graphics, motion and production.")}</p>
      }
      actions={
        <Tag>
          {technologyEntries.length}
          {" " + translateUi("technologies")}
        </Tag>
      }
      controls={
        <>
          <div className="technology-pool-controls">
            <Input
              aria-label={translateUi("Search technologies")}
              prefix={<Search size={16} />}
              placeholder={translateUi("Search names, pool keys, packages or capabilities…")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              allowClear
            />
            <Select
              aria-label={translateUi("Technology type")}
              value={kind}
              onChange={setKind}
              allowClear
              placeholder={translateUi("All types")}
              options={kinds.map((value) => ({ value, label: readable(value) }))}
            />
            <Select
              aria-label={translateUi("Production role")}
              value={role}
              onChange={setRole}
              allowClear
              placeholder={translateUi("All roles")}
              options={roles.map((value) => ({ value, label: readable(value) }))}
            />
          </div>
          <p className="technology-pool-count" role="status">
            {entries.length}
            {" " + translateUi("of") + " "}
            {technologyEntries.length}
            {" " + translateUi("technologies")}
          </p>
        </>
      }
    >
      {!entries.length && (
        <Empty description={translateUi("No technologies match these filters.")} />
      )}
      {groupTechnologyEntries(entries).map((group) => (
        <Card
          key={group.kind}
          data-technology-type={group.kind}
          className="technology-pool-table"
          title={readable(group.kind)}
          extra={
            <Tag>
              {group.entries.length}{" "}
              {group.entries.length === 1 ? translateUi("technology") : translateUi("technologies")}
            </Tag>
          }
        >
          <Table
            rowKey="key"
            columns={columns.map((column) => ({
              ...column,
              title: typeof column.title === "string" ? translateUi(column.title) : column.title,
            }))}
            dataSource={group.entries}
            pagination={false}
            size="small"
            tableLayout="fixed"
            scroll={{ x: 1000 }}
            locale={{ emptyText: translateUi("No technologies match these filters.") }}
            expandable={{
              columnWidth: 40,
              expandedRowRender: (entry) => <TechnologyCard key={entry.key} entry={entry} />,
            }}
          />
        </Card>
      ))}
      {selected && (
        <Dialog title={translateUi(selected.definition.name)} onClose={closeCard} wide>
          <TechnologyCard key={selected.key} entry={selected} />
        </Dialog>
      )}
      {toolKey && !selected && (
        <div role="alert">
          {translateUi("Tool not found.") + " "}
          <Button onClick={closeCard}>{translateUi("Back to technology pool")}</Button>
        </div>
      )}
    </PageTemplate>
  );
}
