import { translateUi, useUiLanguage } from "../i18n";
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
  useUiLanguage();
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
        {translateUi("Renderer")}
        <Select
          aria-label={translateUi("Video renderer")}
          value={value}
          options={videoRendererIds.map((id) => ({
            value: id,
            label: videoRenderers[id].trial
              ? videoRenderers[id].label
              : translateUi("{{value0}} · default", { value0: videoRenderers[id].label }),
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
                ? translateUi("Multiplane isn’t ready on this computer")
                : translateUi("Trying Multiplane {{value0}}", { value0: multiplaneVersion })
            }
            description={
              status && !status.available
                ? status.problem
                : translateUi(
                    "This project’s previews and full film use Multiplane; other projects keep HyperFrames. Limits: {{value0}}.",
                    { value0: multiplaneLimits.join(", ") },
                  )
            }
          />
          <Collapse
            size="small"
            items={[
              {
                key: "coverage",
                label: translateUi("Supported settings and limits"),
                children: (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="setting"
                    aria-label={translateUi("Multiplane setting support")}
                    dataSource={multiplaneSettingCoverage}
                    columns={[
                      { title: translateUi("Setting"), dataIndex: "setting", width: 140 },
                      {
                        title: translateUi("Support"),
                        dataIndex: "support",
                        width: 120,
                        render: (value: RendererSettingSupport) => (
                          <Tag color={support[value].color}>{support[value].label}</Tag>
                        ),
                      },
                      { title: translateUi("Details"), dataIndex: "detail" },
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
