# Bundled skill registrations

Each skill has its own named registration and prompt. The upstream files stay separate in `assets/agent-skills/<id>`.

| File                   | Responsibility                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `anatomy.ts`           | Anatomy identity, workspace path, native Claude name and pinned manifest   |
| `anatomy-prompt.ts`    | Anatomy instructions introduced to both providers                          |
| `registry.ts`          | Explicit list of reviewed skills and combined guidance                     |
| `types.ts`             | Shared registration contract                                               |
| `../bundled-skills.ts` | Shared integrity checks, workspace staging and Claude plugin configuration |

To add a skill, bundle its reviewed upstream files and hash manifest, create `<id>.ts` and `<id>-prompt.ts`, and register it in `registry.ts`. Staging, the plugin manifest, Claude's allowed skill names and startup checks, and both providers' guidance all derive from that registry. Add skill-specific tests and run the shared skill/provider tests. No runtime download or user-global discovery is used.
