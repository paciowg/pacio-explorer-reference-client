# Repository instructions

## Comments

- Every hand-written TypeScript and TSX file must begin, before imports, with a one- or two-sentence module documentation comment.
- The module comment must describe the file's responsibility and any important ownership boundary. Do not restate the filename or enumerate exports.
- Use additional comments only to explain non-obvious intent, FHIR or PACIO rules, interoperability constraints, fallbacks, intentional limitations, and deviations.
- Do not narrate straightforward code or duplicate the README.
- When changing behavior, update any affected comments. New files and modified legacy files must follow this pattern.
- Keep changes narrowly scoped: do not add unrelated explanatory comments while performing a focused implementation change.
