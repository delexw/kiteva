import { parseErrorCode, type ErrorCode } from "../shared/errors";
const customerErrors: Record<ErrorCode, string> = {
  REQUEST_FAILED: "Something went wrong. Please try again.",
  INVALID_REQUEST: "Please check your project settings and try again.",
  FILE_TOO_LARGE: "Images and documents: up to 10 MB each. Audio: up to 25 MB each.",
  TOO_MANY_ATTACHMENTS: "Use up to 12 attachments per project.",
  TOO_MANY_IMAGES: "Use up to 8 images per project.",
  TOO_MANY_AUDIO: "Use up to 2 audio files per project.",
  TOO_MANY_DOCUMENTS: "Use up to 3 documents or other files per project.",
  ASSETS_TOO_LARGE: "Keep all attachments together within 100 MB.",
  AUDIO_TOO_LONG: "Choose audio no longer than 10 minutes per file.",
  SPEECH_NOT_READY:
    "Local narration needs setup. Upload a voice recording or run the speech setup.",
  SPEECH_TOO_LONG:
    "The voice is longer than the film. Shorten the script, increase speaking speed, or choose a longer film.",
  SPEECH_FAILED: "We couldn't prepare or mix the voice. Check the speech settings and try again.",
  DOCUMENT_TOO_LONG:
    "Keep documents within 30 pages combined. Text files count 500 words per page.",
  FILE_TYPE_UNSUPPORTED: "This file type isn't supported. Please choose another file.",
  FILE_REQUIRED: "Please choose a file to attach.",
  FILE_UNREADABLE: "We couldn't read your file. Please attach it again.",
  PROJECT_NOT_FOUND:
    "This project is no longer available. Open another project or start a new one.",
  PROJECT_DELETING: "This project is being deleted. Please wait a moment.",
  PROJECT_ACTIVE: "Stop the project and wait for it to finish before deleting it.",
  PAGE_NOT_READY: "Your page isn't ready yet. Please wait for it to finish.",
  REFERENCE_CAPTURE_FAILED:
    "We couldn't capture this website. Check the link or attach screenshots, then try again. Your project settings are kept.",
  PUBLIC_URL_REQUIRED: "Please use a publicly accessible website link.",
  LOCAL_URL_REQUIRES_LOCAL_AGENT:
    "Localhost links work only with the local agent. Use the local agent or provide a publicly accessible website link.",
  PREPARATION_FAILED: "We couldn't prepare your creative directions. Please try again.",
  VIDEO_GENERATION_FAILED: "We couldn't finish your video. Please try again.",
  PAGE_GENERATION_FAILED: "We couldn't finish your page. Please try again.",
  GENERATION_INTERRUPTED: "Your project was interrupted. Please retry to continue.",
  NOT_FOUND: "This item is no longer available. Please choose another one.",
  ACCESS_DENIED: "This request couldn't be completed. Please open the app locally and try again.",
  ARTIFACT_UNAVAILABLE: "This file isn't available yet. Please wait for your project to finish.",
};

export function customerErrorMessage(
  code: unknown,
  fallback: ErrorCode = "REQUEST_FAILED",
): string {
  return customerErrors[parseErrorCode(code, fallback)];
}
