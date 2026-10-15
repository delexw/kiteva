import { Select } from "antd";
import { Children, isValidElement, type ReactNode } from "react";

type StudioSelectOptionProps = { value?: string | number; children: ReactNode; disabled?: boolean };
export function studioSelectOptions(children: ReactNode) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<StudioSelectOptionProps>(child)) return [];
    return [
      {
        value: String(child.props.value ?? child.props.children),
        label: child.props.children,
        disabled: child.props.disabled,
      },
    ];
  });
}
export function StudioSelect({
  value,
  onValueChange,
  children,
  className,
  disabled,
  ...props
}: {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <Select
      className={`studio-ant-select ${className || ""}`}
      value={String(value)}
      onChange={onValueChange}
      disabled={disabled}
      options={studioSelectOptions(children)}
      popupMatchSelectWidth={false}
      styles={{ popup: { root: { maxWidth: "calc(100vw - 32px)" } } }}
      {...props}
    />
  );
}
export function StudioSelectOption(_props: StudioSelectOptionProps) {
  return null;
}
