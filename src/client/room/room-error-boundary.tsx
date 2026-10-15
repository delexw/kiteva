import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Button } from "antd";

export class RoomErrorBoundary extends Component<
  { children: ReactNode; label: string },
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
          title={`${this.props.label} couldn’t be shown`}
          description="Nothing was deleted. The rest of your room still works."
          action={
            <Button size="small" onClick={() => this.setState({ error: undefined })}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }
}
