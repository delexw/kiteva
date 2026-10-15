export function CachedTokenUsage({ input }: { input: number | null }) {
  return (
    <>
      <td>{input === null ? "Not recorded" : input.toLocaleString()}</td>
      <td>Not reported</td>
    </>
  );
}
