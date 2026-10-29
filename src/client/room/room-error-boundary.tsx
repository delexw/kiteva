import { translateUi } from "../i18n/service";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Button, Space } from "antd";

export class RoomErrorBoundary extends Component<
  { children: ReactNode; label: string; recoveryAction?: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} failed to display`, error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="room-pad">
        <Alert
          type="error"
          showIcon
          title={translateUi("{{label}} couldn’t be shown", { label: this.props.label })}
          description={translateUi("Nothing was deleted. The rest of your room still works.")}
          action={
            <Space wrap>
              <Button size="small" onClick={() => this.setState({ error: undefined })}>
                {translateUi("Try again")}
              </Button>
              {this.props.recoveryAction}
            </Space>
          }
        />
      </div>
    );
  }
}
