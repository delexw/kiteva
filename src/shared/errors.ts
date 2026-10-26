export const errorCodes = [
  "REQUEST_FAILED",
  "INVALID_REQUEST",
  "FILE_TOO_LARGE",
  "TOO_MANY_ATTACHMENTS",
  "TOO_MANY_IMAGES",
  "TOO_MANY_AUDIO",
  "TOO_MANY_DOCUMENTS",
  "ASSETS_TOO_LARGE",
  "AUDIO_TOO_LONG",
  "SPEECH_NOT_READY",
  "SPEECH_TOO_LONG",
  "SPEECH_FAILED",
  "DOCUMENT_TOO_LONG",
  "FILE_TYPE_UNSUPPORTED",
  "FILE_REQUIRED",
  "FILE_UNREADABLE",
  "PROJECT_NOT_FOUND",
  "PROJECT_DELETING",
  "PROJECT_ACTIVE",
  "DEPENDENCY_CLEANUP_FAILED",
  "PAGE_NOT_READY",
  "PUBLIC_URL_REQUIRED",
  "REFERENCE_CAPTURE_FAILED",
  "LOCAL_URL_REQUIRES_LOCAL_AGENT",
  "PREPARATION_FAILED",
  "VIDEO_GENERATION_FAILED",
  "PAGE_GENERATION_FAILED",
  "GENERATION_INTERRUPTED",
  "NOT_FOUND",
  "ACCESS_DENIED",
  "ARTIFACT_UNAVAILABLE",
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export function parseErrorCode(value: unknown, fallback: ErrorCode = "REQUEST_FAILED"): ErrorCode {
  return errorCodes.find((code) => code === value) ?? fallback;
}

export class CodedError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "CodedError";
  }
}

export function errorCode(error: unknown, fallback: ErrorCode = "REQUEST_FAILED"): ErrorCode {
  return parseErrorCode(
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined,
    fallback,
  );
}
