export interface ClaudeTokenUsage {
  input: number | null;
  output: number | null;
  reads: number | null;
  writes: number | null;
  writes5m: number | null;
  writes1h: number | null;
}
