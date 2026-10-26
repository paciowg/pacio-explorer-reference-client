# PACIO Explorer Reference Client

The PACIO Explorer Reference Client is a standalone browser client that demonstrates [PACIO Project](https://pacioproject.org/) capabilities and use cases using open FHIR R4 servers. The application stores saved server settings locally in the user's browser and makes FHIR requests directly to the selected server. The server must permit the required requests with CORS.

## Try it out online

You can try out the latest version of the PACIO Explorer Reference Client directly on its [GitHub Page](https://paciowg.github.io/pacio-explorer-reference-client/).

## Workflows

This application currently supports a handful of PACIO workflows in addition to basic FHIR server interaction:

### Read patient data

1. Connect to a FHIR R4 server; the client validates `GET /metadata`.
2. Browse up to 100 patients and filter them in the browser.
3. Open a patient summary. The client uses `Patient/{id}/$everything` with 250-entry pages, a 500-result cap, and falls back to `Patient/{id}` if `$everything` is unavailable.

From the patient summary, you can open either type of document:

- An advance directive. The client displays generic `DocumentReference` metadata and, when its attachment references a document Bundle, loads its Composition and PDF source forms.
- A Transition of Care (TOC) document. The client loads the same-server document Bundle referenced by its `DocumentReference`, then presents Composition metadata, required TOC sections, reasons for empty sections, and readable summaries of included resources.

Missing scalar values display as `--`; loaded empty lists display `None recorded`; sections requiring an unavailable `$everything` Bundle display `Unavailable`.

The patient display has three top navigation tabs: **Personal Information** (the default), **Clinical Information**, and **Documents**. The patient header remains visible across views, and switching tabs preserves loaded data and expanded entries. Documents shows four sections in order: TOC Documents, Advance Directives, SMP Medication Lists, and SMP Collections, each with empty states and creation actions. Each tab has a bookmarkable URL; document workflows return to Documents, while device and nutrition creation return to Clinical Information.

Expand a clinical entry and choose **View FHIR JSON ↗** to open its current server resource in a new tab. The Patient link is visible below the patient name; document links are on their detail pages. The viewer displays indented, syntax-colored, selectable JSON. Device requests and usage records also show their associated Device, and document references show their same-server document Bundle when available. Each resource loads independently, so an unavailable associated resource leaves the primary resource visible. Viewer links retain their original source server; they fetch current data rather than a snapshot of the clinical display.

### Create a Transition of Care document

From a patient summary, open the TOC creation flow and choose a destination FHIR server, title, status, author, custodian, and at least one patient resource. The form exposes all 15 required TOC sections and records an explicit empty reason for every section without selected entries.

The active server remains the source of the document data and is preselected as the destination. For a different destination, the client first searches for the patient by complete identifiers and then by name. A successful search with no match causes a copy of the Patient, without the source `id` or `meta`, to be created. A failed search stops publication because the client cannot safely determine whether the patient is absent.

The client builds a PACIO TOC document Bundle and posts it with a companion TOC `DocumentReference` to the destination. Selected advance directives remain linked as separate documents; their contents are not merged into the TOC document. See [TOC document construction and references](#toc-document-construction-and-references) for technical details.

### Create an ADI PMO document

The PACIO Advance Directive Interoperability (ADI) workflow creates a portable medical order (PMO) document. From a patient summary, select the PMO creation flow and provide the required author, attester, authenticator, signed date, PDF source form, and destination FHIR server.

Destination selection and patient matching work as described in [Create a Transition of Care document](#create-a-transition-of-care-document). The active server remains the source of the document data.

The client posts a PACIO ADI PMO document Bundle to the destination, then posts the companion ADI `DocumentReference` pointing to that Bundle and destination Patient. The writes are intentionally separate: if a later write fails, resources already created on the destination remain there and the page reports the error.

### View devices and create a PFE DeviceRequest

The patient Devices section shows typed DeviceRequest, DeviceUseStatement, and Device entries. Devices linked from a request or usage record appear inside its expansion rather than as duplicate standalone rows. Missing linked Devices are read from the active server when expanded; unavailable references leave the event readable.

Choose **Create Device Request** to enter Required and Must Support PFE fields, select one of six assistive device types, and optionally provide the Organization responsible for the Device. Spoon uses SNOMED CT `303514007` (Spoon) for the feeding-spoon use case. The device name, name type, and UDI values are set automatically and displayed as read-only details. The synthetic UDI identifier and human-readable carrier use `DEMO-PFE-<device code>` and are shared by device type for demonstration purposes. Advanced groups include scheduling, parameters, device users, preferred locations, clinical justification, prior requests, insurance, and notes.

Optional **Reasons for this request** controls provide transfer lists for coded reasons and existing clinical records. Both start unselected and can be combined with clinical justification. The demo reason codes are a small SNOMED CT/ICD-10-CM subset; reason references support destination-patient Condition, Observation, DiagnosticReport, and DocumentReference records.

The destination defaults to the active server. Reference choices come from the destination, and Patient matching follows the existing document workflows. Patient lookup and reference loading are read-only until submission. Creation writes Device first, then DeviceRequest. If the request is rejected, the created Device remains and is reused for retry within that form session; an uncertain write outcome requires destination verification before another submission. Transaction support is deferred.

The pure [PFE reference implementation](src/igs/pacioPfe/README.md) targets the October 6, 2026 PFE source revision and US Core 9.0.0. It owns profile construction, validation, terminology, and extension interpretation independently of React and transport.

### View and create PFE nutrition orders

The patient **Nutrition Orders** section displays oral diet, supplement, and enteral formula orders, including historical and generic FHIR NutritionOrders. Expand an order to view its components, quantities, schedules, administration rates, instructions, and references.

Choose **Create Nutrition Order** to enter Required and Must Support PFE fields using small demo terminology subsets. Oral diet, supplements, and enteral formula can be selected individually or combined. At least one component must contain data. The destination defaults to the active server, and orderer, encounter, and allergy choices come from that destination.

The allergy choice is explicit: select existing patient AllergyIntolerance records, or assert **No known food allergies**. The latter reuses an eligible active record or creates a standalone no-known-food-allergy record before posting NutritionOrder. It does not infer a negative statement from an empty search or embed an allergy inside the order. Patient matching/copying follows existing workflows. Destination-patient allergies are searched directly, including a recheck on submission.

Writes remain separate. If the order is rejected, any created Patient or AllergyIntolerance remains on the destination and is reused for retry within that form session. An uncertain write outcome blocks automatic retry pending destination verification. Creation does not edit existing orders or fulfill them; IV nutrition and vitamin/mineral prescribing are outside this workflow.

## Developer notes

### Patient create-page conventions

Before implementing or modifying a create page, inspect an existing create page and its shared styles. Start with [Device Request creation](src/features/devices/PatientDeviceRequestCreatePage.tsx), or [SMP creation](src/features/medicationProfiles/SmpCreatePage.tsx) for List/collection workflows, and [the shared CSS](src/App.css). Follow their layout and controls rather than introducing a separate page shell. These requirements also appear in [AGENTS.md](AGENTS.md) for coding agents.

- Use `/patients/:id/<plural-type>/new` for creation routes, such as `portable-medical-orders/new`. Update both the parser and the links that open the page.
- Use a single outer `panel`. Its top `panel-header` has a left column containing an `h2` titled `Create X`, followed by the loaded patient's name in `p.create-patient-name` (regular font weight). Use `getDisplayNameFromHumanName` to format the name.
- The header's right column shows the active FHIR server's name and URL using `panel-server-details`, `panel-server-label`, and `panel-server-url`, without a `Source FHIR server` heading. This remains the source-server identity when a separate destination is selected. Retain the shared responsive behavior.
- Below the header, place a `Back to patient` button in `page-actions page-actions-spaced`, styled with `secondary-button outline`. Return to `?view=clinical` for device/nutrition workflows or `?view=documents` for document/List/collection workflows. Do not repeat the patient name beneath this button.
- Render the form within the outer panel without another bordered form container. Keep workflow-specific fields and review sections consistent with existing controls.

### SMP medication Lists and collections

The patient **Documents** tab shows reusable medication Lists and published SMP collections in separate sections. Medication Lists expand inline using the same disclosure style as clinical entries; their members load on first expansion and remain available when the entry is reopened. Collections open their snapshot detail pages. **Create medication list** selects existing patient MedicationStatements with dated transfer controls and saves a point-in-time List on the active source server, then returns to Documents with a success notification. All patient-scoped statements remain selectable regardless of SMP compatibility issues, without conformance labels; unavailable medication-name lookups fall back to existing displays or resource IDs. List type, date, and practitioner/role source are explicit; an empty List requires an explicit reason. Existing statements are never modified or automatically assigned an SMP profile.

**Create SMP collection** selects one or more saved Lists, captures their statements and supporting resources, and reviews the snapshot before publishing to any saved server. Statement profile compatibility is not a publication gate; correct member resource types, patient identity, and reference resolution remain required. Shared statements are included once while retaining membership in each List. Source-local absolute and historical references are resolved and rewritten to internal UUID references; unresolved/external references and conflicting versions stop publication. The destination receives a collection Bundle and an SMP DocumentReference, plus a copied Patient only when needed. Embedded Lists and medications are not independently created there.

Destination identifier matching must be unique. A name-only match requires explicit selection. A rejected index can be retried against its retained Bundle; an uncertain write requires destination verification before another submission. Retry state lasts only for the current form session. Collection details render the captured resources rather than current live resources. Existing Current Medications, ADI, and TOC behavior remains unchanged.

The implementation targets the October 2, 2026 SMP development revision, including its official DocumentReference profile and LOINC `70006-2`. See the [SMP implementation notes](src/igs/pacioSmp/README.md) for the pinned artifacts, indexing convention, resource limits, and external validation handoff. New statement/adherence and MedicationRequest authoring remain deferred.

### Run and verify the application locally

Run commands from the repository root:

```sh
npm install
npm run dev
```

For verification:

```sh
npm test
npm run build
npm run lint
```

Before a release, manually smoke-test server connection and saved-server flows, patient search and fallback behavior, advance-directive PDF opening, and ADI and TOC creation to both the active server and another saved CORS-enabled FHIR R4 server.

### Architecture

The document-creation reference paths are deliberately short:

```text
PMO form -> createPmoDocument -> PACIO ADI builders -> destination patient + publishing helpers -> FHIR transport
TOC form -> createTocDocument -> PACIO TOC builders -> destination patient + publishing helpers -> FHIR transport
```

- `src/features/advanceDirectives/` owns PMO workflow orchestration, generic advance-directive display, and browser file/attachment behavior.
- `src/igs/pacioAdi/` owns pure PACIO ADI resource construction and ADI interpretation. It has no React, network, storage, or browser-file dependencies.
- `src/features/transitionsOfCare/` owns TOC selection, workflow orchestration, discovery, and display.
- `src/igs/pacioToc/` owns pure PACIO TOC section definitions and resource construction.
- `src/igs/pacioPfe/` owns pure PFE Device, DeviceRequest, and NutritionOrder construction, profile-specific validation, demo terminology, and device extension interpretation.
- `src/features/devices/` owns patient device viewing, destination reference choices, creation forms, and sequential publication.
- `src/features/nutritionOrders/` owns patient nutrition viewing, destination choices, forms, and order/allergy publication.
- `src/lib/fhir/` owns generic URL normalization, transport, destination Patient matching and creation, document Bundle construction and publishing, document-detail loading, Bundle indexing, reference closure, and reusable resource option derivation.
- `src/features/patientSummary/` owns patient-summary composition and demographics.
- `src/components/` owns reusable presentation components and presentation types.

Generic FHIR mechanics contain no PACIO profiles or terminology. Generic advance-directive display remains available for non-ADI `DocumentReference` resources; PACIO ADI enrichment is optional.

### Multi-selection controls

Use the shared `TransferList` in `src/components/TransferList.tsx` for fields selecting multiple items from an available set. Available items appear on the left and selected items on the right; Add and Remove actions move items immediately between lists. The panes stack on narrow screens. Actions support keyboard use, preserve focus after a transfer, show empty states, and respect disabled forms. Controlled values remain the underlying resource references, and the existing selection-label convention applies.

DeviceRequest Supporting assessments, Supporting goals, Prior requests, Insurance, Coded reasons, and Reason references use this pattern. Prefer it over native multi-selects requiring Ctrl/Command selection in similar future work. Existing controls elsewhere are migrated only when requested. These instructions are also in `AGENTS.md` for coding agents.

Resource transfer lists, including DeviceRequest Reason references, display timestamps beneath names and sort both panes newest first. Use `getResourceTransferChoices` and `TransferList` with `showDates`: resource-specific clinical/authored dates take precedence over a labelled Last updated fallback from `meta.lastUpdated`. Zoned timestamps display in the user's local timezone; missing or unusable dates show Date unavailable and sort last. Equal dates retain their existing order. These dates are presentation metadata and are not added to submitted reference displays. Coded-reason lists retain their terminology order and omit timestamps.

### Dates and local time

Prefer date-only inputs wherever the underlying FHIR datatype and applicable profile permit date-only precision; retain time entry when those constraints require it. Default dates to the user's local calendar date, validate them, and submit `YYYY-MM-DD` directly without adding midnight or a timezone. DeviceRequest authored date, NutritionOrder order date, and PMO signing and Relevant through follow this convention, using date-only FHIR `dateTime` values.

Display calendar dates and partial dates at their original precision. When a value includes a zoned time, clinical summaries, resource details, document views, transfer lists, and saved-server timestamps display its date and time using the browser's locale and current timezone, with a visible timezone indicator. Use the shared helpers in `src/lib/dateTime.ts` and `formatDate` in `src/lib/fhir/formatters.ts`; keep raw timestamps for sorting and payloads rather than parsing localized display text. Standalone and recurring clock times retain their original precision. Generated creation/update timestamps and ADI version identifiers remain UTC; existing resource timestamps retain their time precision. These development preferences are also recorded in `AGENTS.md`.

### Patient page listing order

All dated clinical listings on the main patient page display newest first: Active Problems, Current Medications, Devices, Nutrition Orders, Known Allergies, Most Recent Vitals, Advance Directives, Transitions of Care, SMP Medication Lists, and SMP Collections. For matching valid clinical dates, `meta.lastUpdated` breaks ties newest first; valid update timestamps precede missing or invalid ones. Complete ties and entries with missing or invalid clinical dates retain their existing order, with undated entries last. Update timestamps never replace clinical dates or change the displayed date. Apply the same tie-breaker when selecting the latest usable vital reading. Use `compareClinicalDatesDesc` in `src/lib/dateTime.ts` on raw FHIR dates before formatting and before applying list limits.

Keep sorting and display dates aligned with each section's existing precedence: problems use onset then recorded date; medications use asserted date, effective date, then effective-period start; allergies use last occurrence then recorded date; nutrition orders use order date; documents use DocumentReference date. Device requests use authoredOn; device usage uses recordedOn, timingDateTime, then timingPeriod.start. Standalone Devices have no summary event date and sort last; manufacture and expiration dates are not event-date substitutes. Associated Devices remain inside their request/usage expansion.

Vitals retain one latest usable reading per supported type, using effectiveDateTime, issued, then meta.lastUpdated, and order the selected readings newest first. Preserve existing filters, patient scoping, deduplication, and list limits. Fixed demographic fields and Emergency Contacts retain their existing order. These development conventions are also recorded in `AGENTS.md`.

### Practitioner reference choices

Mixed-resource selection fields use `ResourceType: Display name — Optional detail`, for example `PractitionerRole: Anita Chu — Primary Care Provider`, `Patient: Betsy Johnson`, or `RelatedPerson: Charles Johnson — son`. Single-type fields use an unprefixed display. The field's supported types determine this, even when only one type currently has choices. Rich selection cards place their resource-type badge before the title.

Use the shared `formatResourceSelectionLabel`, `getResourceSelectionDisplay`, and `getResourceReferenceChoices` helpers in `src/lib/fhir/resourceOptions.ts`. Keep UI labels separate from submitted FHIR reference displays; never extract display text by parsing a label. Missing names fall back to resource IDs. General resource-detail displays are independent of this selection convention.

Every field accepting both PractitionerRole and Practitioner must prefer roles: omit a bare Practitioner when an available PractitionerRole references it, retain unpaired practitioners, and keep each distinct role selectable. Role labels should include the practitioner's name and role when available; submissions retain the selected PractitionerRole reference. Match relative, same-server absolute, and versioned references without treating an external-server practitioner as a local match. Unresolved roles remain selectable.

Use `getPractitionerChoices` in `src/lib/fhir/resourceOptions.ts` for shared role matching, labels, and unpaired-practitioner selection. ADI PMO and TOC creation use its role options; PMO data-enterer choices also use its unpaired practitioners. The complete practitioner map includes reference aliases for resolution and must not be listed as choices. `getRolePreferredReferenceOptions` wraps this helper for resource-backed choices and is shared by DeviceRequest Requester and Device Users and NutritionOrder Orderer. This convention applies to all new and modified fields; it is also recorded in `AGENTS.md` for coding agents.

### TOC document construction and references

The client builds a profiled PACIO TOC document Bundle, resolves its references against the active source server to include referenced resources, and rewrites its internal references for portability. It then posts the Bundle and companion TOC `DocumentReference` to the destination.

For same-server publication, the companion `DocumentReference` retains its author, authenticator, and custodian references. For cross-server publication, those optional Must Support references are omitted because their source-local resource IDs do not establish identities on the destination server. Participant details represented by the Composition remain in the document Bundle; the destination Patient remains the `DocumentReference.subject`.

Selected advance directives are included as ADI `DocumentReference` entries. Their existing attachment links continue to identify the separate ADI document Bundles; those Bundles are not flattened into the TOC document.

### Deliberate constraints

The app remains a small browser reference client. It does not add a backend, cache layer, router or state-management framework, or additional FHIR client dependency.

TOC support reads indexed TOC `DocumentReference` resources that point to same-server document Bundles. Creation can publish ADI and TOC documents to another saved server, but cross-server document reading, legacy standalone TOC Compositions, updates, version lineage, discharge notifications, and full in-browser FHIR profile validation are outside the current scope.

### ADI versioning and temporary conformance deviations

ADI document versions are UTC timestamps in `YYYYMMDDhhmmss` form. `Bundle.timestamp`, `Composition.date`, and the ADI document-version extension use the creation instant.

The PMO workflow generates one document identifier and uses it for both `Composition.identifier` and the companion `DocumentReference.masterIdentifier`.

The PACIO ADI implementation guide (IG) is actively evolving. The client retains two temporary deviations for later conformance work:

- The app emits the ADI document-version extension on `Composition`, while the cached ADI FHIR Shorthand (FSH) definitions place that extension in the `DocumentReference` context.
- PMO facilitator data is emitted as a direct `PractitionerRole` reference, which does not yet align with the current facilitator constraint.

Do not treat these as settled guidance. A separate conformance-focused change should review the current IG, validate profiles, and intentionally approve generated-resource changes.

### Routes and persistence

- `#/` — server connection and saved servers
- `#/fhir/:resourceType/:resourceId?server=:encodedBaseUrl` — read-only FHIR JSON viewer tied to its source server
- `#/patients` — patient list
- `#/patients/:id` — patient summary
- `#/patients/:id?view=clinical` — patient clinical information
- `#/patients/:id?view=documents` — patient documents
- `#/patients/:id/portable-medical-orders/new` — create an ADI portable medical order
- `#/patients/:id/advance-directives/:documentReferenceId` — advance-directive detail
- `#/patients/:id/transitions-of-care/new` — create a Transition of Care document
- `#/patients/:id/transitions-of-care/:documentReferenceId` — Transition of Care detail
- `#/patients/:id/device-requests/new` — create a PFE Device and DeviceRequest
- `#/patients/:id/nutrition-orders/new` — create a PFE NutritionOrder and a standalone allergy statement when needed

Saved and active server settings are stored only in browser local storage.
