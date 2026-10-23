import path from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseHtml, type DefaultTreeAdapterMap } from "parse5";
import { parse as parseJavaScript } from "acorn";
import postcss from "postcss";
import values from "postcss-value-parser";

export type MultiplaneShotScope = {
  sourceFile: string;
  shotSources: string[];
  additionalFiles?: string[];
};

// Resource APIs may be aliased or passed to another function. Seeing one anywhere
// makes the graph uncertain, even when a particular call looks static.
const resourceNames = new Set([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "Image",
  "Audio",
  "URL",
  "FontFace",
  "eval",
  "Function",
  "require",
  "importScripts",
  "src",
  "srcset",
  "href",
  "poster",
  "innerHTML",
  "outerHTML",
  "setAttribute",
  "insertAdjacentHTML",
  "write",
  "writeln",
  "createElement",
  "createElementNS",
  "serviceWorker",
  "location",
  "open",
  "Reflect",
  "constructor",
  "contentDocument",
  "cssText",
  "setProperty",
  "insertRule",
  "deleteRule",
  "replaceSync",
  "styleSheets",
  "adoptedStyleSheets",
  "background",
  "backgroundImage",
  "borderImage",
  "listStyleImage",
  "mask",
  "maskImage",
  "cursor",
  "filter",
  "content",
]);

class UnresolvedDependency extends Error {}
class ExternalDependency extends Error {}

/** Resolve static HTML/CSS/module dependencies. Null means caching is unsafe:
 * unknown/computed resources must render again, never trust an incomplete graph.
 * No renderer-specific dependency rules belong in the common render orchestration.
 */
export async function multiplaneShotDependencies(
  workspace: string,
  scope: MultiplaneShotScope,
  signal: AbortSignal,
): Promise<Set<string> | null> {
  const root = path.resolve(workspace);
  const dependencies = new Set<string>();
  const scanned = new Set<string>();
  const pending: Array<{ file: string; kind?: "html" | "css" | "js" }> = [];
  function resource(url: string, parent: string, kind?: "html" | "css" | "js") {
    const value = url.trim();
    if (!value || value.startsWith("#")) return;
    if (/^data:/i.test(value)) throw new UnresolvedDependency("Embedded resource");
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) throw new ExternalDependency("External resource");
    const decoded = decodeURIComponent(value.split(/[?#]/)[0]);
    if (decoded.startsWith("/multiplane/runtime/") && !decoded.split("/").includes("..")) return;
    const file = path.resolve(
      decoded.startsWith("/") ? root : path.dirname(parent),
      decoded.replace(/^\//, ""),
    );
    const relative = path.relative(root, file);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      ["renders", "node_modules", ".git"].includes(relative.split(path.sep)[0])
    )
      throw new UnresolvedDependency("Resource outside authored inputs");
    dependencies.add(file);
    pending.push({ file, kind });
  }
  function css(source: string, file: string, inline = false) {
    const tree = postcss.parse(inline ? `a{${source}}` : source, { from: file });
    tree.walk((node) => {
      if (node.type !== "decl" && node.type !== "atrule") return;
      const text = node.type === "decl" ? node.value : node.params;
      const parsed = values(text);
      if (node.type === "atrule" && node.name.toLowerCase() === "import") {
        const first = parsed.nodes.find((item) => item.type !== "space" && item.type !== "comment");
        if (first?.type === "string") resource(first.value, file, "css");
        else if (first?.type !== "function" || first.value.toLowerCase() !== "url")
          throw new UnresolvedDependency("Computed CSS import");
      }
      parsed.walk((item) => {
        if (item.type !== "function") return;
        const name = item.value.toLowerCase();
        if (["image-set", "-webkit-image-set", "src", "attr", "paint"].includes(name))
          throw new UnresolvedDependency("Indirect CSS resource");
        if (name === "url") {
          const parts = item.nodes.filter(
            (part) => part.type !== "space" && part.type !== "comment",
          );
          if (
            parts.length !== 1 ||
            !["string", "word"].includes(parts[0].type) ||
            parts[0].value.includes("\\")
          )
            throw new UnresolvedDependency("Computed CSS URL");
          resource(
            parts[0].value,
            file,
            node.type === "atrule" && node.name.toLowerCase() === "import" ? "css" : undefined,
          );
          return false;
        }
      });
    });
  }
  function javascript(source: string, file: string) {
    const tree = parseJavaScript(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowAwaitOutsideFunction: true,
    });
    function visit(value: unknown) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const node = value as Record<string, unknown>;
      if (node.type === "ImportExpression") throw new UnresolvedDependency("Dynamic import");
      if (node.type === "Identifier" && resourceNames.has(String(node.name)))
        throw new UnresolvedDependency("Resource API");
      if (
        node.type === "Literal" &&
        typeof node.value === "string" &&
        (resourceNames.has(node.value) || /url\s*\(/i.test(node.value))
      )
        throw new UnresolvedDependency("Indirect resource API");
      if (node.type === "MemberExpression" && node.computed) {
        const property = node.property as Record<string, unknown>;
        if (property.type !== "Literal" || typeof property.value !== "number")
          throw new UnresolvedDependency("Computed property");
      }
      if (
        ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(
          String(node.type),
        ) &&
        node.source
      ) {
        const specifier = (node.source as { value: string }).value;
        if (!/^[./]/.test(specifier)) throw new UnresolvedDependency("Bare module import");
        resource(specifier, file, "js");
      }
      Object.values(node).forEach(visit);
    }
    visit(tree);
  }
  function html(source: string, file: string) {
    function visit(node: DefaultTreeAdapterMap["node"]) {
      if ("tagName" in node) {
        if (
          [
            "iframe",
            "object",
            "embed",
            "base",
            "template",
            "animate",
            "animateMotion",
            "animateTransform",
            "set",
          ].includes(node.tagName)
        )
          throw new UnresolvedDependency("Indirect HTML resource");
        if (
          node.tagName === "meta" &&
          node.attrs.some((attribute) => attribute.name === "http-equiv")
        )
          throw new UnresolvedDependency("Document navigation policy");
        for (const attribute of node.attrs) {
          if (attribute.name.startsWith("on") || ["srcset", "srcdoc"].includes(attribute.name))
            throw new UnresolvedDependency("Dynamic HTML resource");
          if (attribute.name === "style") css(attribute.value, file, true);
          else if (/url\s*\(/i.test(attribute.value)) css(`value:${attribute.value}`, file, true);
          if (["src", "href", "poster", "background"].includes(attribute.name)) {
            resource(
              attribute.value,
              file,
              node.tagName === "script"
                ? "js"
                : node.tagName === "link" &&
                    node.attrs.some((item) => item.name === "rel" && item.value === "stylesheet")
                  ? "css"
                  : undefined,
            );
          }
        }
        const text = () =>
          node.childNodes.map((child) => ("value" in child ? child.value : "")).join("");
        if (
          node.tagName === "script" &&
          !node.attrs.some((attribute) => attribute.name === "src")
        ) {
          const type = node.attrs.find((attribute) => attribute.name === "type")?.value;
          if (!type || /^(module|(?:text|application)\/(?:java|ecma)script)$/i.test(type))
            javascript(text(), file);
          else if (type === "importmap") throw new UnresolvedDependency("Import map");
        }
        if (node.tagName === "style") css(text(), file);
      }
      if ("childNodes" in node) node.childNodes.forEach(visit);
    }
    visit(parseHtml(source));
  }
  try {
    resource(scope.sourceFile, path.join(root, "index.html"), "html");
    for (const file of scope.additionalFiles ?? []) resource(file, path.join(root, "index.html"));
    for (let index = 0; index < pending.length; index++) {
      signal.throwIfAborted();
      const { file, kind } = pending[index];
      const extension = path.extname(file).toLowerCase();
      const formats: Record<string, "html" | "css" | "js"> = {
        ".html": "html",
        ".svg": "html",
        ".css": "css",
        ".js": "js",
        ".mjs": "js",
      };
      const format = kind ?? formats[extension];
      if (!format) {
        if (
          ![
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".avif",
            ".gif",
            ".ico",
            ".woff",
            ".woff2",
            ".ttf",
            ".otf",
            ".mp4",
            ".webm",
            ".wav",
            ".mp3",
            ".ogg",
            ".flac",
            ".m4a",
          ].includes(extension)
        )
          throw new UnresolvedDependency("Unknown resource format");
        continue;
      }
      const key = `${format}:${file}`;
      if (scanned.has(key)) continue;
      scanned.add(key);
      const text = await readFile(file, "utf8");
      if (format === "html") html(text, file);
      if (format === "css") css(text, file);
      if (format === "js") javascript(text, file);
    }
    return dependencies;
  } catch {
    signal.throwIfAborted();
    return null;
  }
}
