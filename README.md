# PACIO Explorer

PACIO Explorer is a standalone React browser client for open FHIR R4 servers. It has no backend: the browser stores saved server settings locally and makes FHIR requests directly to the selected server. The server must permit the required requests with CORS.

## Workflows

### Read patient data

1. Connect to a FHIR R4 server; the client validates `GET /metadata`.
2. Browse up to 100 patients and filter them in the browser.
3. Open a patient summary. The client uses `Patient/{id}/$everything` with pagination and falls back to `Patient/{id}` if `$everything` is unavailable.
4. Open an advance directive. The client displays generic `DocumentReference` metadata and, when its attachment references a document Bundle, loads its Composition and PDF source forms.

Missing scalar values display as `--`; loaded empty lists display `None recorded`; sections requiring an unavailable `$everything` Bundle display `Unavailable`.

### Create an ADI PMO

From a patient summary, select the PMO creation flow and provide the required author, attester, authenticator, signed date, and PDF source form. The client builds a PACIO ADI PMO document Bundle, posts it, then builds and posts the companion ADI `DocumentReference` pointing to that Bundle. The writes are intentionally separate: if the second write fails, the Bundle remains on the server and the page reports the error.

## FHIR requests

The app uses these endpoints relative to the configured server URL:

- `GET /metadata`
- `GET /Patient?_count=100`
- `GET /Patient/{id}`
- `GET /Patient/{id}/$everything` with `_count`, `_include`, `_revinclude`, and `_include:iterate`
- `GET /DocumentReference/{id}`
- `GET /Bundle/{id}` and same-server Bundle references
- `GET /PractitionerRole?_count=200&_include=PractitionerRole:practitioner`
- `GET /Organization?_count=200`
- `GET /RelatedPerson?patient={id}&_count=200`
- `GET /{resourceType}/{id}` while closing PMO Bundle references
- `POST /Bundle`
- `POST /DocumentReference`

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

## Architecture

The PMO creation reference path is deliberately short:

```text
PMO form -> createPmoDocument -> PACIO ADI builders -> shared FHIR helpers -> FHIR transport
```

- `src/features/advanceDirectives/` owns PMO workflow orchestration, generic advance-directive display, and browser file/attachment behavior.
- `src/igs/pacioAdi/` owns pure PACIO ADI resource construction and ADI interpretation. It has no React, network, storage, or browser-file dependencies.
- `src/lib/fhir/` owns generic URL normalization, transport, document Bundle construction, Bundle indexing, and reference closure.
- `src/features/patientSummary/` owns patient-summary composition and demographics.
- `src/components/` owns reusable presentation components and presentation types.

Generic FHIR mechanics contain no PACIO profiles or terminology. Generic advance-directive display remains available for non-ADI `DocumentReference` resources; PACIO ADI enrichment is optional.

## ADI versioning and temporary conformance deviations

ADI document versions are UTC timestamps in `YYYYMMDDhhmmss` form. `Bundle.timestamp`, `Composition.date`, and the ADI document-version extension use the creation instant.

The PACIO ADI IG is actively evolving. This behavior-preserving implementation intentionally retains two temporary deviations for later conformance work:

- The app emits the ADI document-version extension on `Composition`, while the cached ADI FSH defines that extension in the `DocumentReference` context.
- PMO facilitator data is emitted as a direct `PractitionerRole` reference, which does not yet align with the current facilitator constraint.

Do not treat these as settled guidance. A separate conformance-focused change should review the current IG, validate profiles, and intentionally approve generated-resource changes.

## Routes and persistence

- `#/` — server connection and saved servers
- `#/patients` — patient list
- `#/patients/:id` — patient summary
- `#/patients/:id/advance-directives/:documentReferenceId` — advance-directive detail

Saved and active server settings are stored only in browser local storage.

## Historical planning

[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is historical background. For the current architecture and refactoring status, use this README and [REFACTORING-PLAN.md](REFACTORING-PLAN.md).
