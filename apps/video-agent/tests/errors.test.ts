import { expect, it } from "vitest";
import { CodedError, errorCode, parseErrorCode } from "../src/shared/errors";

it("preserves coded failures without interpreting diagnostic text", () => {
  for (const message of ["Original diagnostic", "Completely different wording"]) {
    const error = new CodedError("FILE_TOO_LARGE", message, 413);
    expect(errorCode(error)).toBe("FILE_TOO_LARGE");
    expect(error.message).toBe(message);
    expect(error.statusCode).toBe(413);
  }
  expect(errorCode(new Error("FILE_TOO_LARGE"))).toBe("REQUEST_FAILED");
});
it("safely handles unknown codes and legacy failures", () => {
  for (const unknown of [undefined, null, {}, 123, "constructor", "__proto__", "EACCES"]) {
    expect(parseErrorCode(unknown)).toBe("REQUEST_FAILED");
    expect(errorCode(unknown, "VIDEO_GENERATION_FAILED")).toBe("VIDEO_GENERATION_FAILED");
  }
  expect(errorCode({ code: "EACCES" }, "PREPARATION_FAILED")).toBe("PREPARATION_FAILED");
});
