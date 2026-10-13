# Repository instructions

## Multi-selection controls

- Prefer the shared `TransferList` in `src/components/TransferList.tsx` for fields selecting multiple items from an available set. Show available items on the left and selected items on the right; adding or removing an item moves it immediately between lists. Stack the panes on narrow screens.
- Use controlled values and preserve existing resource label and reference conventions. Provide keyboard-accessible Add/Remove actions, maintain focus after transfers, show empty states, and honor disabled form state. Avoid native `<select multiple>` controls requiring Ctrl/Command selection for similar new or modified fields.
- Resource transfer lists must use `getResourceTransferChoices` and `TransferList` with `showDates`. Display resource-specific clinical/authored dates (including time and timezone when present), with labelled `meta.lastUpdated` fallback; show Date unavailable when no valid date exists. Sort both panes newest first, with undated entries last and ties retaining their existing order. Keep timestamp metadata out of submitted FHIR reference displays. Terminology-only transfer lists retain their original order without timestamps.
- DeviceRequest Supporting assessments, Supporting goals, Prior requests, Insurance, Coded reasons, and Reason references use this pattern. Do not migrate unrelated existing controls unless requested.

## Resource selection labels

- Fields supporting multiple resource types must use `ResourceType: Display name — Optional detail`. Use exact FHIR resource-type names; role or relationship details follow the name. Fields supporting only one resource type use an unprefixed display.
- Use `formatResourceSelectionLabel`, `getResourceSelectionDisplay`, and `getResourceReferenceChoices` in `src/lib/fhir/resourceOptions.ts`. Decide whether to prefix from the field's supported types, not the types currently present in its options. In rich selection cards, show the resource-type badge before the title.
- Keep UI `label` separate from FHIR `Reference.display`. Submit the unprefixed display; never recover it by parsing the UI label. Use the resource ID when a name is unavailable, without duplicating the resource type. Do not use a RelatedPerson's patient's name as the RelatedPerson's name.

## Practitioner reference choices

- In every field that supports both PractitionerRole and Practitioner, prefer PractitionerRole options and omit a bare Practitioner when an available role references it. Retain practitioners without a matching role and keep all distinct roles for a practitioner.
- Match relative, same-server absolute, and versioned practitioner references. An external-server reference must not suppress a local practitioner with the same id. Keep unresolved roles available.
- Label roles with the practitioner's name and role when available, and submit the selected PractitionerRole reference.
- Reuse `getPractitionerChoices` in `src/lib/fhir/resourceOptions.ts` for role labels, practitioner reference resolution, and unpaired practitioners. Use its `unpairedPractitioners` result in mixed PractitionerRole/Practitioner fields; its full `practitionerByReference` map includes resolution aliases and must not be listed as choices.
- Use `getRolePreferredReferenceOptions` for resource-backed reference choices; it delegates practitioner matching to `getPractitionerChoices`. Role-only fields should use the shared `roleOptions` result. Do not duplicate matching or filtering in feature code. Apply this convention to new and modified fields, including demo forms.

## Comments

- Every hand-written TypeScript and TSX file must begin, before imports, with a one- or two-sentence module documentation comment.
- The module comment must describe the file's responsibility and any important ownership boundary. Do not restate the filename or enumerate exports.
- Use additional comments only to explain non-obvious intent, FHIR or PACIO rules, interoperability constraints, fallbacks, intentional limitations, and deviations.
- Do not narrate straightforward code or duplicate the README.
- When changing behavior, update any affected comments. New files and modified legacy files must follow this pattern.
- Keep changes narrowly scoped: do not add unrelated explanatory comments while performing a focused implementation change.
