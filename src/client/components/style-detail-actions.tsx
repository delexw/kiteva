import { Button, Flex } from "antd";
import { ArrowRight } from "lucide-react";
import type { Style } from "../../shared/contracts";
import { translateUi, useUiLanguage } from "../i18n";
import { StyleMetadataCopy } from "./style-metadata-copy";

export function StyleDetailActions({
  style,
  onUse,
}: {
  style: Style;
  onUse: (style: Style) => void;
}) {
  useUiLanguage();
  return (
    <Flex className="style-detail-actions" gap="small" wrap align="center" justify="flex-end">
      <StyleMetadataCopy style={style} />
      <Button
        type="primary"
        icon={<ArrowRight size={16} />}
        iconPlacement="end"
        onClick={() => onUse(style)}
      >
        {translateUi("Use this Motion Graphic")}
      </Button>
    </Flex>
  );
}
