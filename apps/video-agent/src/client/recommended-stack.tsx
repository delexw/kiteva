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
  return (
    <div className="recommended-stack">
      {libraries.length === 0 && <p>No specific libraries suggested.</p>}
      {libraries.map((library) => {
        const technology = technologyEntryForDefinition(library);
        return (
          <article className="stack-entry" key={library.name}>
            <strong>
              {technology ? (
                <Link to={technologyCardPath(technology.key)}>{library.name}</Link>
              ) : (
                library.name
              )}
            </strong>
            {library.optional && <small>Optional</small>}
            <p>{library.purpose}</p>
            {(library.package || library.runtime) && (
              <dl className="stack-facts">
                {library.package && (
                  <>
                    <dt>Package</dt>
                    <dd>
                      <code>{library.package}</code>
                    </dd>
                  </>
                )}
                {library.runtime && (
                  <>
                    <dt>Runs in</dt>
                    <dd>{library.runtime}</dd>
                  </>
                )}
              </dl>
            )}
            {!!library.suggested_apis?.length && (
              <>
                <h4>Suggested APIs</h4>
                <ul className="stack-apis">
                  {library.suggested_apis.map((api) => (
                    <li key={api}>
                      <code>{api}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {library.integration_guidance && <p>{library.integration_guidance}</p>}
            {library.docs_url && /^https?:\/\//.test(library.docs_url) && (
              <a href={library.docs_url} target="_blank" rel="noreferrer">
                Documentation ↗
              </a>
            )}
          </article>
        );
      })}
      {implementation && (
        <>
          <h3>Implementation approach</h3>
          <p>{implementation}</p>
        </>
      )}
      {selectionGuidance && (
        <Collapse
          size="small"
          items={[
            {
              key: "Choosing libraries",
              label: "Choosing libraries",
              forceRender: true,
              children: (
                <>
                  <p>{selectionGuidance}</p>
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
