# PACIO Explorer Refactoring Plan

## Summary

Refactor the application into predictable layers while preserving routes, UI behavior, FHIR requests, generated document content, persistence, and error handling. Provide a short, documented path from the PACIO ADI workflow through explicit IG resource builders and shared FHIR document mechanics. Keep generic FHIR utilities independent of application features, reduce oversized React modules, restore a passing build, and add regression coverage before moving behavior.

## Review Findings

1. **The repository does not currently build.**
   - Source files import `fhir/r4`, but `@types/fhir` is neither declared nor installed.
   - `npm run build` consequently reports missing modules, implicit `any` types, and secondary nullability errors.

2. **IG behavior is not isolated for implementers.**
   - ADI constants and construction rules are divided among `PatientPmoCreatePage.tsx`, `AdiPmoService.ts`, and `DocumentReferenceService.ts`.
   - The create page constructs important ADI inputs and `DocumentReference` metadata directly inside its submit handler.
   - An implementer cannot currently follow a short, clearly documented path that distinguishes reusable FHIR document mechanics from ADI-specific resource semantics.

3. **The largest React pages mix too many responsibilities.**
   - `PatientPmoCreatePage.tsx` combines server loading, option derivation, date/identifier handling, file encoding, ADI orchestration, and approximately 400 lines of form rendering.
   - `AdvanceDirectiveDetailPage.tsx` combines loading, ADI interpretation, bundle indexing, reference resolution, attachment decoding, browser window operations, and rendering.
   - `patientSummaryModel.ts` combines patient demographics with several unrelated clinical-resource transformations.

4. **Layer dependencies are inconsistent.**
   - Generic `src/lib/fhir/client.ts` imports URL normalization from the server feature.
   - Reusable clinical components import their data types from the patient-summary feature.
   - The top-level `services` directory mixes pure IG builders with network writes, making ownership unclear.

5. **FHIR processing contains avoidable inefficiencies.**
   - `closeBundleReferences` fetches each unresolved reference sequentially.
   - Advance-directive bundle maps are rebuilt every time a reference is resolved.
   - Existing parallel fetches and the `$everything` fallback strategy are otherwise appropriately simple and should be retained.

6. **There is duplication and dead code.**
   - ADI profile URLs, extension URLs, LOINC concepts, and identifier systems are repeated.
   - `fetchPractitioners`, `buildDocumentBundleReference`, `AuthenticatorOption`, and the PMO page's unused success-message path appear unreferenced.
   - List limiting is performed in both model and component layers.

7. **Documentation is stale and internally inconsistent.**
   - README and `IMPLEMENTATION_PLAN.md` describe Phase 1 as read-only even though PMO creation is implemented.
   - README still contains Vite template material and refers to running from `browser_client_poc/`, which is not the current repository layout.
   - The documented architecture omits the implemented services and write workflow.

8. **The automated quality baseline is insufficient.**
   - There are no tests.
   - Lint reports one unused type and three unsafe `finally` returns.
   - Generated FHIR resources and request sequencing have no regression protection.

9. **Potential ADI conformance drift exists but is outside this behavior-preserving refactor.**
   - Cached PACIO ADI FSH defines `adi-docVersionNumber-extension` in the `DocumentReference` context, while the application also emits it on `Composition`.
   - Current PMO facilitator constraints do not align with the application's direct `PractitionerRole` facilitator reference.
   - These findings require a separate conformance change because correcting them would intentionally alter generated FHIR output.

## Target Organization and Interfaces

Use this ownership model:

- `src/lib/fhir/`: generic transport, URL handling, document-Bundle assembly, bundle traversal/indexing, and reference closure. It must not import from `features` or `igs`.
- `src/igs/pacioAdi/`: pure PACIO ADI interpretation and explicit resource construction with no React, browser storage, or network calls. It may use generic FHIR document helpers but must keep profile URLs, terminology, extensions, narratives, and IG-specific resource shapes visible.
- `src/features/advanceDirectives/`: pages, form models, browser attachment behavior, and workflow orchestration.
- `src/features/patientSummary/`: patient-summary loading/rendering and non-ADI patient/clinical transformations.
- `src/components/`: reusable presentation and presentation-owned types.
- Remove `src/services/` after its responsibilities have been relocated.

Expose these principal shared and IG-facing APIs:

```ts
createDocumentBundle(input: CreateDocumentBundleInput): Bundle
buildAdiPmoBundle(input: CreateAdiPmoBundleInput): Bundle
buildAdiDocumentReference(input: CreateAdiDocumentReferenceInput): DocumentReference
readAdiDocument(bundle: Bundle, documentReference: DocumentReference): AdiDocumentModel
```

Implement `createDocumentBundle` in `src/lib/fhir/documents.ts` as a transparent constructor that accepts a timestamp, an explicit Composition entry, and ordered supporting entries. It sets `Bundle.type` to `document`, places the Composition first, and preserves supporting-entry order. It must not know about PACIO profiles, terminology, sections, or extensions.

Place PMO Composition and source-form Binary construction in `src/igs/pacioAdi/pmoDocument.ts`. Place the companion ADI `DocumentReference` builder in `src/igs/pacioAdi/documentReference.ts` so it can be reused by other ADI document types when its semantics actually apply. Keep both builders pure and retain the current emitted values, profiles, narratives, identifiers, references, and section order.

Document the reference path as `feature workflow -> PACIO ADI builders -> shared FHIR document helpers -> FHIR transport`. Do not require all IG behavior to live in one file; optimize for a shallow, explicit call path of two or three focused files.

## Step-by-Step Implementation

### 1. Restore and record a usable baseline

- Add `@types/fhir` and `vitest` as development dependencies and update `package-lock.json`.
- Add `test` as `vitest run` and optionally `test:watch` as `vitest`.
- Confirm that installing the FHIR declarations removes the cascading type errors; fix only genuine remaining type errors without changing runtime behavior.
- Remove returns from `finally` blocks by guarding state updates inside the block, preserving unmounted-component behavior.
- Remove the unused `AuthenticatorOption`.

### 2. Add characterization coverage before moving behavior

- Test `formatAdiVersionNumber` with UTC boundaries and invalid input.
- Test the public PMO Bundle and server `DocumentReference` builders using fixed inputs and deterministic UUID mocks.
- Assert resource profiles, codes, extensions, timestamps, narratives, entry order, and references individually rather than using opaque full snapshots.
- Mock `fetch` to characterize FHIR URLs, headers, pagination merging, error parsing, `$everything` fallback-related requests, bundle closure, and the two POST operations used during PMO creation.
- Add model tests for patient summaries and advance-directive extraction, including missing fields and unavailable bundles.

### 3. Correct generic dependency direction

- Move `normalizeBaseUrl` into `src/lib/fhir/url.ts`.
- Import it from both FHIR transport and server storage so `lib` no longer depends on a feature.
- Type `createDocumentReference` to accept and return `DocumentReference` instead of generic `Resource`.
- Keep `client.ts` as the single, straightforward list of generic FHIR operations; organize it into transport, pagination, reads, searches, and writes with section comments rather than adding extra client abstractions.

### 4. Simplify generic bundle handling

- Add `createDocumentBundle` as the small shared constructor described above. Require callers to supply the Composition and Bundle entries explicitly rather than introducing a schema, fluent builder, or IG abstraction framework.
- Add a reusable bundle index that resolves entries by `fullUrl`, `ResourceType/id`, absolute same-server references, and contained IDs.
- Build that index once per bundle and pass it to callers instead of rebuilding maps for every reference.
- In `closeBundleReferences`, fetch each wave of unique unresolved references with `Promise.all`, then append results in the original reference order so Bundle output remains stable.
- Preserve recursive closure, error messages, deduplication, and URN rewriting behavior.

### 5. Create focused PACIO ADI builders

- Move PMO Composition, source-form Binary, narratives, terminology, and Bundle construction into `src/igs/pacioAdi/pmoDocument.ts`; have it call the generic `createDocumentBundle` constructor.
- Move companion ADI `DocumentReference` construction into `src/igs/pacioAdi/documentReference.ts`.
- Keep profile URLs, identifier systems, LOINC concepts, temporary code-system values, status types, and input types beside the builder whose semantics they define. Extract a shared ADI constant only when multiple ADI modules use the same value with the same meaning.
- Move ADI version formatting into `src/igs/pacioAdi/version.ts` because both ADI builders use the same version-number rule; do not place it in generic FHIR utilities.
- Keep reference closure and server writes outside the pure builder.
- Rename `buildServerDocumentReference` to the domain-specific `buildAdiDocumentReference`; remove the unused generic `buildDocumentBundleReference`.
- Preserve the generated FHIR resource shape exactly. Do not correct the separately identified conformance drift in this refactor.
- Do not create a generalized IG builder, inheritance hierarchy, configuration-driven schema, or FHIR-building DSL. Shared helpers should cover mechanical FHIR operations only.

### 6. Extract pure ADI reading logic

- Create `src/igs/pacioAdi/adiDocument.ts` for extension parsing, Composition selection, facilitator/data-enterer interpretation, document-detail derivation, referenced-Bundle detection, and attachment discovery.
- Return plain attachment descriptors containing label, MIME type, embedded data or URL; do not call browser APIs from the IG module.
- Use the generic bundle index for reference resolution.
- Preserve current precedence between Composition and `DocumentReference` values and preserve current warning/fallback behavior.

### 7. Organize the advance-directive feature

- Move `PatientPmoCreatePage.tsx` and `AdvanceDirectiveDetailPage.tsx` into `src/features/advanceDirectives/`; update routing imports without changing hashes.
- Extract PMO option derivation, jurisdiction calculation, date conversion, identifier creation, and file-to-base64 conversion into `pmoFormModel.ts`.
- Add `createPmoDocument.ts` as the small workflow coordinator:
  1. Build the initial Bundle.
  2. Close and rewrite its references.
  3. POST the Bundle.
  4. Build the companion ADI `DocumentReference` using the returned Bundle ID.
  5. POST the `DocumentReference`.
- Preserve the existing two-write sequence, request bodies, success navigation, and partial-failure behavior.
- Keep page modules focused on React state, effects, event handling, and rendering.
- Move Blob URL creation and `window.open` behavior into a small browser attachment utility.

### 8. Split patient-summary transformations by concern

- Retain `patientSummaryModel.ts` as the public composition point.
- Move demographic/contact extraction into `patientDemographics.ts`.
- Move Condition, MedicationStatement, AllergyIntolerance, Observation, and advance-directive list extraction into `clinicalSummary.ts`.
- Preserve all current inclusion rules, ordering, truncation, placeholders, and ten-item limit.
- Apply the ten-item limit in the model only; presentation components should render the items they receive.

### 9. Remove presentation-to-feature coupling

- Define the clinical list item interfaces in a small component-owned type module or directly in the reusable component props.
- Have patient-summary models depend on those neutral presentation types, rather than reusable components importing from a feature model.
- Keep `AppLayout`'s server context use because it is application-shell behavior rather than a generic visual primitive.

### 10. Remove confirmed dead code and normalize naming

- Remove `fetchPractitioners` if the complete test suite and source search confirm no caller.
- Remove the PMO page's unused success-message state and rendering path.
- Use one naming convention for ADI/PMO types and functions: `AdiPmo...` for TypeScript symbols and `pacioAdi` for the IG directory.
- Avoid unrelated component abstractions or formatting-only rewrites.

### 11. Clean the stylesheet without changing visuals

- Keep a single stylesheet for this small application.
- Add clear sections for shell, server pages, patient pages, advance-directive pages, shared forms/buttons, banners, and responsive rules.
- Consolidate duplicate selectors only when the final cascade and computed values remain identical.
- Remove selectors only after confirming they have no static or dynamically constructed use.

### 12. Bring documentation in line with the application

- Update README to describe both read and PMO creation workflows, all FHIR endpoints used, the current root-level run commands, and the new directory ownership.
- Document the reference path from the feature workflow through `pmoDocument.ts`, `documentReference.ts`, shared document-Bundle helpers, and transport. Explain what is reusable FHIR behavior and what is PACIO ADI-specific.
- Replace remaining Vite-template prose with project-specific build, lint, and test instructions.
- Mark `IMPLEMENTATION_PLAN.md` as the historical initial plan and clearly direct readers to README and `REFACTORING-PLAN.md` for the current architecture.
- Record the deferred IG-conformance findings without proposing silent fixes.

## Test and Acceptance Plan

- `npm run build` completes successfully.
- `npm run lint` completes with no warnings.
- `npm test` passes.
- Builder tests confirm unchanged Bundle and `DocumentReference` semantics for fixed inputs.
- Shared document-constructor tests confirm document type, Composition-first ordering, timestamp handling, and unchanged supporting-entry order without asserting any IG-specific content.
- Network tests confirm unchanged endpoints, query parameters, request headers, two-POST order, and error messages.
- Bundle tests cover nested reference closure, deduplication, URN rewriting, contained references, absolute references, and a failed referenced-resource fetch.
- Model tests cover complete and sparse patients, `$everything` unavailable state, clinical sorting/filtering, ADI detail precedence, missing Composition, and malformed PDF data.
- Manual smoke testing confirms:
  - Connect, save, activate, delete, and disconnect server flows.
  - Patient list search and patient-summary fallback.
  - Advance-directive detail loading and PDF opening.
  - PMO form defaults, validation, creation, success notification, and navigation.
- Compare representative pre- and post-refactor generated FHIR resources after normalizing UUIDs and creation timestamps; all other fields and entry ordering must match.

## Assumptions and Deferred Work

- Adding `@types/fhir` and Vitest is approved.
- Cached PACIO ADI FSH is sufficient for this review; the IG mirror will not be refreshed.
- The refactor preserves current user-visible and FHIR-output behavior, including existing request limits, `$everything` parameters, two-step writes, and partial-write failure behavior.
- ADI conformance corrections are explicitly deferred to a separate change with profile validation and intentional output-change review.
- No router, state-management library, CSS framework, backend, caching layer, or additional FHIR client dependency will be introduced.
- Reuse is capability-oriented: generic FHIR mechanics may be shared across PACIO IGs, while IG-specific profiles and semantics remain explicit in focused modules.
- New abstractions must be justified by a mechanical invariant or demonstrated reuse; speculative cross-IG frameworks are out of scope.
