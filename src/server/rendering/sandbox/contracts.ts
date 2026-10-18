export interface RenderCommand {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}
