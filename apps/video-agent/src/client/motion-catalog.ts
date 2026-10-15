import { z } from "zod";
import { MotionPatternSchema } from "../shared/contracts";

export async function loadMotionCatalog(signal: AbortSignal) {
  const response = await fetch("/api/motions", { signal });
  if (!response.ok) throw Error("Could not load motion library");
  return z.array(MotionPatternSchema).parse(await response.json());
}
