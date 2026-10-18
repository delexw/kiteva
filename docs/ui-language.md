# Interface language

Use **EN / 中文** in the room header to switch between English and Simplified Chinese. The choice takes effect immediately, survives reloads on the same browser and synchronizes between tabs. Switching the interface does not call a model.

The interface language and **Video language** are separate. Changing the interface preserves the original idea, supplied scripts and lyrics, selected voices, project settings and generated assets. Video language still controls the text and speech produced during project building.

Motion Graphic and motion cards and details include translated names, visual descriptions, palette constraints, audio guidance, variants, combinations, motion sequences, adaptation notes and preview descriptions. Tool purposes, runtimes, integration guidance and type/role filters are translated; package names, API names, URLs and stable catalog IDs retain their original spelling. Catalog search accepts both original English text and its Chinese translation. The detail resources are generated ahead of time and stored in the codebase; browsing never starts translation calls. Original executable templates and complete technical metadata remain source records.

Governance translates its headings, filters, statuses, recorded task purposes, pricing explanations and historical-record notices. Model IDs, monetary values, project names, original invocation prompts and schemas are preserved.

## Implementation

[`UiLanguageService`](../src/client/i18n/service.ts) owns an i18next instance, resource lookup, language changes, bilingual search and locale-aware formatting. React components use the shared service; they do not choose between English and Chinese labels with conditionals.

The large Chinese catalog is downloaded as a separate JSON asset on the first switch to Chinese, then reused for the page lifetime. The service loads all catalog translations before applying that switch; a newer language selection takes precedence over an earlier pending load. English uses the original catalog text without downloading the Chinese resource.

Resources have distinct owners:

| Resource                                                            | Contents                                                                                                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`en.json`](../src/client/i18n/en.json)                             | English interface labels and interpolation templates                                                                       |
| [`zh-CN.json`](../src/client/i18n/zh-CN.json)                       | Matching Chinese interface labels                                                                                          |
| [`catalog.zh-CN.json`](../src/client/i18n/catalog.zh-CN.json)       | Catalog presentation text, including long detail guidance and public preview notes; English uses the original catalog text |
| [`governance.zh-CN.json`](../src/client/i18n/governance.zh-CN.json) | Governance task names, statuses and cost explanations; English uses the original recorded labels                           |

[`UiLanguageProvider`](../src/client/i18n/index.tsx) supplies React subscriptions and native Ant Design locale data. Ant Design X receives its corresponding locale in the room. Browser storage is read after mounting, so server rendering does not access browser globals. If storage is unavailable, switching still works for the current page.

Add translations to the relevant resource, then use `translateUi(key, values)` at the presentation boundary. Keep the original IDs and domain data for state, filtering selections, links and API requests. Components that own translated views subscribe using `useUiLanguage()`; their pure child views inherit rerenders. Unknown user content is returned unchanged.

A catalog coverage test enumerates every displayed field through `CatalogDisplayText` and requires a translation resource for it, including nested variants and combinations. The unit tests cover resource parity, placeholders, plurals, server rendering, catalog coverage, bilingual search, Governance records and unchanged project inputs. The isolated browser test covers live switching, persistence, a narrow viewport and the absence of model or project mutations.
