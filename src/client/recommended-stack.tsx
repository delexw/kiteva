import { translateUi, useUiLanguage } from "./i18n";
import { Collapse } from "antd";
import { Link } from "react-router-dom";
import { technologyCardPath, technologyEntryForDefinition } from "./technology-pool-model";
import type { z } from "zod";
import type { StackEntrySchema } from "../shared/contracts";

export function RecommendedStack({
  libraries,
  implementation,
  selectionGuidance,
}: {
  libraries: z.infer<typeof StackEntrySchema>[];
  implementation?: string;
  selectionGuidance?: string;
}) {
  useUiLanguage();
  return (
    <div className="recommended-stack">
      {libraries.length === 0 && <p>{translateUi("No specific libraries suggested.")}</p>}
      {libraries.map((library) => {
        const technology = technologyEntryForDefinition(library);
        return (
          <article className="stack-entry" key={library.name}>
            <strong>
              {technology ? (
                <Link to={technologyCardPath(technology.key)}>{translateUi(library.name)}</Link>
              ) : (
                translateUi(library.name)
              )}
            </strong>
            {library.optional && <small>{translateUi("Optional")}</small>}
            <p>{translateUi(library.purpose ?? "Not specified")}</p>
            {(library.package || library.runtime) && (
              <dl className="stack-facts">
                {library.package && (
                  <>
                    <dt>{translateUi("Package")}</dt>
                    <dd>
                      <code>{library.package}</code>
                    </dd>
                  </>
                )}
                {library.runtime && (
                  <>
                    <dt>{translateUi("Runs in")}</dt>
                    <dd>{translateUi(library.runtime)}</dd>
                  </>
                )}
              </dl>
            )}
            {!!library.suggested_apis?.length && (
              <>
                <h4>{translateUi("Suggested APIs")}</h4>
                <ul className="stack-apis">
                  {library.suggested_apis.map((api) => (
                    <li key={api}>
                      <code>{api}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {library.integration_guidance && <p>{translateUi(library.integration_guidance)}</p>}
            {library.docs_url && /^https?:\/\//.test(library.docs_url) && (
              <a href={library.docs_url} target="_blank" rel="noreferrer">
                {translateUi("Documentation ↗")}
              </a>
            )}
          </article>
        );
      })}
      {implementation && (
        <>
          <h3>{translateUi("Implementation approach")}</h3>
          <p>{translateUi(implementation)}</p>
        </>
      )}
      {selectionGuidance && (
        <Collapse
          size="small"
          items={[
            {
              key: "Choosing libraries",
              label: translateUi("Choosing libraries"),
              forceRender: true,
              children: (
                <>
                  <p>{translateUi(selectionGuidance)}</p>
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
