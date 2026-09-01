# PACIO Explorer

PACIO Explorer is a standalone React browser client for open FHIR R4 servers. It has no backend: the browser stores saved server settings locally and makes FHIR requests directly to the selected server. The server must permit the required requests with CORS.

## Workflows

### Read patient data

1. Connect to a FHIR R4 server; the client validates `GET /metadata`.
2. Browse up to 100 patients and filter them in the browser.
3. Open a patient summary. The client uses `Patient/{id}/$everything` with 250-entry pages, a 500-result cap, and falls back to `Patient/{id}` if `$everything` is unavailable.
4. Open an advance directive. The client displays generic `DocumentReference` metadata and, when its attachment references a document Bundle, loads its Composition and PDF source forms.
5. Open a Transition of Care document. The client loads the same-server document Bundle referenced by its `DocumentReference`, then presents Composition metadata, required TOC sections, empty reasons, and readable summaries of included resources.

Missing scalar values display as `--`; loaded empty lists display `None recorded`; sections requiring an unavailable `$everything` Bundle display `Unavailable`.

### Create an ADI PMO

From a patient summary, select the PMO creation flow and provide the required author, attester, authenticator, signed date, PDF source form, and destination FHIR server. The active server remains the source of the document data. The client matches or creates the patient on the destination, posts a PACIO ADI PMO document Bundle there, then posts the companion ADI `DocumentReference` pointing to that Bundle and destination Patient. The writes are intentionally separate: if a later write fails, resources already created on the destination remain there and the page reports the error.

### Create a Transition of Care document

From a patient summary, open the TOC creation flow and choose a destination FHIR server, title, status, author, custodian, and at least one patient resource. The form exposes all 15 required TOC sections and records an explicit empty reason for every section without selected entries. It builds a profiled PACIO TOC document Bundle, resolves and closes its references against the active source server, rewrites its internal references for portability, and posts the Bundle and companion TOC `DocumentReference` to the destination.

The active server is preselected as the destination. For a different destination, the client first searches for the patient by complete identifiers and then by name. A successful search with no match causes a copy of the Patient, without the source `id` or `meta`, to be created. A failed search stops publication because the client cannot safely determine whether the patient is absent.

For same-server publication, the companion `DocumentReference` retains its author, authenticator, and custodian references. For cross-server publication, those optional Must Support references are omitted because their source-local resource IDs do not establish identities on the destination server. Participant details represented by the Composition remain in the closed document Bundle; the destination Patient remains the `DocumentReference.subject`.

Selected advance directives are included as ADI `DocumentReference` entries. Their existing attachment links continue to identify the separate ADI document Bundles; those Bundles are not flattened into the TOC document.

## FHIR requests

The app uses these endpoints relative to the configured server URL:

- `GET /metadata`
- `GET /Patient?_count=100`
- `GET /Patient?identifier={system|value}` and `GET /Patient?family={family}&given={given}` while matching a patient on a destination server
- `GET /Patient/{id}`
- `GET /Patient/{id}/$everything` with `_count`, `_include`, `_revinclude`, and `_include:iterate`
- `GET /Questionnaire/{id}` for server-local QuestionnaireResponse labels in TOC creation
- `GET /DocumentReference/{id}`
- `GET /Bundle/{id}` and same-server Bundle references
- `GET /PractitionerRole?_count=200&_include=PractitionerRole:practitioner`
- `GET /Organization?_count=200`
- `GET /RelatedPerson?patient={id}&_count=200`
- `GET /{resourceType}/{id}` while closing PMO Bundle references
- `POST /Bundle`
- `POST /DocumentReference`
- `POST /Patient` when no destination patient matches

## Run and verify

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

## Architecture

The document-creation reference paths are deliberately short:

```text
PMO form -> createPmoDocument -> PACIO ADI builders -> destination patient + publishing helpers -> FHIR transport
TOC form -> createTocDocument -> PACIO TOC builders -> destination patient + publishing helpers -> FHIR transport
```

- `src/features/advanceDirectives/` owns PMO workflow orchestration, generic advance-directive display, and browser file/attachment behavior.
- `src/igs/pacioAdi/` owns pure PACIO ADI resource construction and ADI interpretation. It has no React, network, storage, or browser-file dependencies.
- `src/features/transitionsOfCare/` owns TOC selection, workflow orchestration, discovery, and display.
- `src/igs/pacioToc/` owns pure PACIO TOC section definitions and resource construction.
- `src/lib/fhir/` owns generic URL normalization, transport, destination Patient matching and creation, document Bundle construction and publishing, document-detail loading, Bundle indexing, reference closure, and reusable resource option derivation.
- `src/features/patientSummary/` owns patient-summary composition and demographics.
- `src/components/` owns reusable presentation components and presentation types.

Generic FHIR mechanics contain no PACIO profiles or terminology. Generic advance-directive display remains available for non-ADI `DocumentReference` resources; PACIO ADI enrichment is optional.

## Deliberate constraints

The app remains a small browser reference client. It does not add a backend, cache layer, router or state-management framework, or additional FHIR client dependency.

TOC support reads indexed TOC `DocumentReference` resources that point to same-server document Bundles. Creation can publish ADI and TOC documents to another saved server, but cross-server document reading, legacy standalone TOC Compositions, updates, version lineage, discharge notifications, and full in-browser FHIR profile validation are outside the current scope.

## ADI versioning and temporary conformance deviations

ADI document versions are UTC timestamps in `YYYYMMDDhhmmss` form. `Bundle.timestamp`, `Composition.date`, and the ADI document-version extension use the creation instant.

The PMO workflow generates one document identifier and uses it for both `Composition.identifier` and the companion `DocumentReference.masterIdentifier`. This shared value is an intentional correction to the earlier implementation, which generated unrelated values for the same document. It is an approved exception to the refactor's otherwise strict output-preservation rule.

The PACIO ADI IG is actively evolving. This behavior-preserving implementation intentionally retains two temporary deviations for later conformance work:

- The app emits the ADI document-version extension on `Composition`, while the cached ADI FSH defines that extension in the `DocumentReference` context.
- PMO facilitator data is emitted as a direct `PractitionerRole` reference, which does not yet align with the current facilitator constraint.

Do not treat these as settled guidance. A separate conformance-focused change should review the current IG, validate profiles, and intentionally approve generated-resource changes.

## Routes and persistence

- `#/` — server connection and saved servers
- `#/patients` — patient list
- `#/patients/:id` — patient summary
- `#/patients/:id/pmo` — create an ADI portable medical order
- `#/patients/:id/advance-directives/:documentReferenceId` — advance-directive detail
- `#/patients/:id/transitions-of-care/new` — create a Transition of Care document
- `#/patients/:id/transitions-of-care/:documentReferenceId` — Transition of Care detail

Saved and active server settings are stored only in browser local storage.
