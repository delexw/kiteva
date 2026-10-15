import { useEffect, useState } from "react";
import { Alert, Collapse, Select, Table, Tag } from "antd";
import { api } from "../lib/api";
import {
  multiplaneLimits,
  multiplaneSettingCoverage,
  multiplaneVersion,
  videoRendererIds,
  videoRenderers,
  type RendererSettingSupport,
  type VideoRenderer,
} from "../../shared/video-renderers";

type MultiplaneStatus = { available: boolean; version: string; problem?: string };
const support: Record<RendererSettingSupport, { color: string; label: string }> = {
  supported: { color: "success", label: "Supported" },
  partial: { color: "warning", label: "Partly" },
  unsupported: { color: "error", label: "Not supported" },
};

export function RendererChoice({
  value,
  onChange,
}: {
  value: VideoRenderer;
  onChange: (renderer: VideoRenderer) => void;
}) {
  const [status, setStatus] = useState<MultiplaneStatus>();
  useEffect(() => {
    if (value !== "multiplane") return;
    let live = true;
    api<{ multiplane: MultiplaneStatus }>("/api/renderers")
      .then((result) => live && setStatus(result.multiplane))
      .catch(
        (error) =>
          live &&
          setStatus({ available: false, version: multiplaneVersion, problem: error.message }),
      );
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <>
      <label>
        Renderer
        <Select
          aria-label="Video renderer"
          value={value}
          options={videoRendererIds.map((id) => ({
            value: id,
            label: videoRenderers[id].trial
              ? videoRenderers[id].label
              : `${videoRenderers[id].label} · default`,
          }))}
          onChange={onChange}
        />
      </label>
      {value === "multiplane" && (
        <div className="room-renderer-trial">
          <Alert
            type={status && !status.available ? "error" : "info"}
            showIcon
            title={
              status && !status.available
                ? "Multiplane isn’t ready on this computer"
                : `Trying Multiplane ${multiplaneVersion}`
            }
            description={
              status && !status.available
                ? status.problem
                : `This project’s previews and full film use Multiplane; other projects keep HyperFrames. Limits: ${multiplaneLimits.join(", ")}.`
            }
          />
          <Collapse
            size="small"
            items={[
              {
                key: "coverage",
                label: "Supported settings and limits",
                children: (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="setting"
                    aria-label="Multiplane setting support"
                    dataSource={multiplaneSettingCoverage}
                    columns={[
                      { title: "Setting", dataIndex: "setting", width: 140 },
                      {
                        title: "Support",
                        dataIndex: "support",
                        width: 120,
                        render: (value: RendererSettingSupport) => (
                          <Tag color={support[value].color}>{support[value].label}</Tag>
                        ),
                      },
                      { title: "Details", dataIndex: "detail" },
                    ]}
                    scroll={{ x: 480 }}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </>
  );
}
