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

Choose **Create Device Request** to enter Required and Must Support PFE fields, select one of five assistive device types, and optionally provide the Organization responsible for the Device. The device name, name type, and UDI values are set automatically and displayed as read-only details. The synthetic UDI identifier and human-readable carrier use `DEMO-PFE-<device code>` and are shared by device type for demonstration purposes. Advanced groups include scheduling, parameters, device users, preferred locations, clinical justification, prior requests, insurance, and notes.

The destination defaults to the active server. Reference choices come from the destination, and Patient matching follows the existing document workflows. Patient lookup and reference loading are read-only until submission. Creation writes Device first, then DeviceRequest. If the request is rejected, the created Device remains and is reused for retry within that form session; an uncertain write outcome requires destination verification before another submission. Transaction support is deferred.

The pure [PFE reference implementation](src/igs/pacioPfe/README.md) targets the October 6, 2026 PFE source revision and US Core 9.0.0. It owns profile construction, validation, terminology, and extension interpretation independently of React and transport.

### View and create PFE nutrition orders

The patient **Nutrition Orders** section displays oral diet, supplement, and enteral formula orders, including historical and generic FHIR NutritionOrders. Expand an order to view its components, quantities, schedules, administration rates, instructions, and references.

Choose **Create Nutrition Order** to enter Required and Must Support PFE fields using small demo terminology subsets. Oral diet, supplements, and enteral formula can be selected individually or combined. At least one component must contain data. The destination defaults to the active server, and orderer, encounter, and allergy choices come from that destination.

The allergy choice is explicit: select existing patient AllergyIntolerance records, or assert **No known food allergies**. The latter reuses an eligible active record or creates a standalone no-known-food-allergy record before posting NutritionOrder. It does not infer a negative statement from an empty search or embed an allergy inside the order. Patient matching/copying follows existing workflows. Destination-patient allergies are searched directly, including a recheck on submission.

Writes remain separate. If the order is rejected, any created Patient or AllergyIntolerance remains on the destination and is reused for retry within that form session. An uncertain write outcome blocks automatic retry pending destination verification. Creation does not edit existing orders or fulfill them; IV nutrition and vitamin/mineral prescribing are outside this workflow.

## Developer notes

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
- `#/patients` — patient list
- `#/patients/:id` — patient summary
- `#/patients/:id/pmo` — create an ADI portable medical order
- `#/patients/:id/advance-directives/:documentReferenceId` — advance-directive detail
- `#/patients/:id/transitions-of-care/new` — create a Transition of Care document
- `#/patients/:id/transitions-of-care/:documentReferenceId` — Transition of Care detail
- `#/patients/:id/device-requests/new` — create a PFE Device and DeviceRequest
- `#/patients/:id/nutrition-orders/new` — create a PFE NutritionOrder and a standalone allergy statement when needed

Saved and active server settings are stored only in browser local storage.
