# Repository instructions

## Patient create pages

- Before adding or changing a create page, inspect an existing create page and its shared styles, then align with that implementation. Use `src/features/devices/PatientDeviceRequestCreatePage.tsx` for the standard layout and `src/features/medicationProfiles/SmpCreatePage.tsx` for List/collection workflows; consult `src/App.css` for the shared classes. Do not design a separate page shell.
- Creation routes end in the plural type followed by `/new`: `/patients/:id/<plural-type>/new`, for example `device-requests/new`, `nutrition-orders/new`, `portable-medical-orders/new`, `transitions-of-care/new`, `medication-lists/new`, and `smp-collections/new`. Keep route parsing and navigation links consistent.
- Use one outer `panel` with a `panel-header` at the top. In the header's left column, show an `h2` reading `Create X`, then the patient name in a `p.create-patient-name` with regular font weight. Format the loaded patient's name with `getDisplayNameFromHumanName`; do not repeat it beneath the back button.
- In the header's right column, use `panel-server-details`, `panel-server-label`, and `panel-server-url` to show the active FHIR server's name and URL. Do not add a `Source FHIR server` heading. This identifies the active source server even when the form offers a different destination. Preserve the shared responsive layout.
- Place a `Back to patient` button below the header using `page-actions page-actions-spaced` and `secondary-button outline`. Return to the relevant patient tab: `?view=clinical` for device/nutrition workflows and `?view=documents` for document/List/collection workflows.
- Place the form content directly in the outer panel, without a second bordered container such as `pmo-form-panel`. Keep workflow-specific fields and review sections consistent with existing form controls.

## Dates and times

- Prefer date-only inputs wherever the underlying FHIR datatype and applicable profile permit date-only precision. Retain time entry when those constraints require it.
- Default date inputs to the user's local calendar date. Validate and submit date-only values as `YYYY-MM-DD`; never add midnight or a timezone to fabricate a timestamp.
- Display date-only and partial-date values at their original precision. When a value includes a zoned time, display its date and time in the browser's current timezone with a visible timezone indicator. Use the shared helpers in `src/lib/dateTime.ts` and `formatDate` in `src/lib/fhir/formatters.ts`.
- Preserve standalone and recurring clock times, which do not identify a zoned instant. Keep raw timestamps for sorting and FHIR payloads; never parse localized display strings.
- Generated creation/update instants and UTC ADI version identifiers remain timestamps. Do not discard time precision from existing resources.

## Patient page listings

- All dated clinical listings on the main patient page must display newest first, with missing or invalid clinical dates last. For matching valid clinical dates, compare `meta.lastUpdated` newest first, with valid update timestamps ahead of missing or invalid ones. Preserve original order when both keys tie and for undated entries. Use `compareClinicalDatesDesc` in `src/lib/dateTime.ts` on raw FHIR date values; never sort localized display strings. Sort before applying list limits.
- Preserve each section's existing clinical-date precedence and use the same raw date for sorting and display. Devices use DeviceRequest authoredOn or DeviceUseStatement recordedOn, timingDateTime, then timingPeriod.start; standalone Devices currently have no summary date and sort last. Do not substitute manufacture/expiration dates for event dates.
- Most Recent Vitals selects one latest usable reading per supported vital, then orders those selected readings newest first. Apply the same update-time tie-breaker to both selection and display ordering. Do not revert to a fixed order by vital type.
- Preserve patient scoping, filters, deduplication, associated-device grouping, and list limits. Fixed demographic fields and Emergency Contacts retain their existing order because they are not dated clinical listings.

## Multi-selection controls

- Prefer the shared `TransferList` in `src/components/TransferList.tsx` for fields selecting multiple items from an available set. Show available items on the left and selected items on the right; adding or removing an item moves it immediately between lists. Stack the panes on narrow screens.
- Use controlled values and preserve existing resource label and reference conventions. Provide keyboard-accessible Add/Remove actions, maintain focus after transfers, show empty states, and honor disabled form state. Avoid native `<select multiple>` controls requiring Ctrl/Command selection for similar new or modified fields.
- Resource transfer lists must use `getResourceTransferChoices` and `TransferList` with `showDates`. Display resource-specific clinical/authored dates (including time and timezone when present), with labelled `meta.lastUpdated` fallback; show Date unavailable when no valid date exists. Sort both panes newest first, with undated entries last and ties retaining their existing order. Keep timestamp metadata out of submitted FHIR reference displays. Terminology-only transfer lists retain their original order without timestamps.
- DeviceRequest Supporting assessments, Supporting goals, Prior requests, Insurance, Coded reasons, and Reason references use this pattern. Do not migrate unrelated existing controls unless requested.

- SMP Collection creation is an intentional exception: use full-width expandable medication List rows with independent checkboxes so membership can be inspected during selection. Keep this a single form submission, with destination Patient matching shared with TOC/ADI and return navigation to the source patient Documents tab.

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
