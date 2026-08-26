# PACIO Explorer Refactoring Plan

## Summary

Refactor the application into predictable layers while preserving routes, UI behavior, FHIR requests, generated document content, persistence, and error handling. Provide a short, documented path from the PACIO ADI workflow through explicit IG resource builders and shared FHIR document mechanics. Keep generic FHIR utilities independent of application features, reduce oversized React modules, retain the passing build and lint baseline, and add regression coverage before moving behavior. Complete the work in independently verifiable milestones, prioritizing the ADI reference path while retaining the broader organization, cleanup, and documentation goals.

## Review Findings

1. **The build baseline has been restored, but the test baseline is still empty.**
   - `@types/fhir` and Vitest are declared and installed.
   - `npm run build` and `npm run lint` pass.
   - `npm test` reports no test files and currently succeeds only because the script uses `--passWithNoTests`.

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
   - `fetchPractitioners`, `buildDocumentBundleReference`, and the PMO page's unused success-message path appear unreferenced.
   - List limiting is performed in both model and component layers.

7. **Documentation is stale and internally inconsistent.**
   - README and `IMPLEMENTATION_PLAN.md` describe Phase 1 as read-only even though PMO creation is implemented.
   - README still contains Vite template material and refers to running from `browser_client_poc/`, which is not the current repository layout.
   - The documented architecture omits the implemented services and write workflow.

8. **The automated quality baseline is insufficient.**
   - There are no test files even though the test runner is configured.
   - Generated FHIR resources and request sequencing have no regression protection.
   - The successful build and lint results must be retained throughout the refactor.

9. **Known ADI conformance drift is temporarily accepted and is outside this behavior-preserving refactor.**
   - Cached PACIO ADI FSH defines `adi-docVersionNumber-extension` in the `DocumentReference` context, while the application also emits it on `Composition`.
   - Current PMO facilitator constraints do not align with the application's direct `PractitionerRole` facilitator reference.
   - The ADI IG is under active development, and the application is expected to align with these areas in a later conformance-focused change.
   - Do not pin an IG snapshot, refresh the IG mirror, add profile validation as an acceptance gate, or change generated output for these findings during this refactor. Document the accepted temporary deviations so implementers do not mistake them for settled IG guidance.

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
type CreateDocumentBundleInput = {
  timestamp: string
  compositionEntry: BundleEntry & { resource: Composition }
  supportingEntries: BundleEntry[]
}

type BundleIndex = {
  resolve(reference: string | undefined, containingResource?: Resource): Resource | undefined
}

type AdiDocumentModel = {
  versionNumber?: string
  dataEnterer?: Reference
  facilitators: Reference[]
}

createDocumentBundle(input: CreateDocumentBundleInput): Bundle
createBundleIndex(bundle: Bundle, baseUrl?: string): BundleIndex
buildAdiPmoBundle(input: CreateAdiPmoBundleInput): Bundle
buildAdiDocumentReference(input: CreateAdiDocumentReferenceInput): DocumentReference
readAdiDocument(
  composition: Composition,
  documentReference: DocumentReference,
): AdiDocumentModel | null
```

Implement `createDocumentBundle` in `src/lib/fhir/documents.ts` as a transparent constructor using the exact input contract above. It sets `Bundle.type` to `document`, copies the timestamp, places the supplied Composition entry first, and preserves supporting-entry order. The caller owns full URLs, identifiers, profiles, and resource construction; the helper must not generate identifiers or know about PACIO profiles, terminology, sections, or extensions.

Implement `createBundleIndex` so relative and `fullUrl` references resolve directly, absolute references resolve only when they are on the optional normalized same-server base URL, and external absolute references return `undefined`. Resolve `#contained` references only within the supplied containing resource; do not use a bundle-global contained-resource map where duplicate contained IDs could collide.

Place PMO Composition and source-form Binary construction in `src/igs/pacioAdi/pmoDocument.ts`. Place the companion ADI `DocumentReference` builder in `src/igs/pacioAdi/documentReference.ts` so it can be reused by other ADI document types when its semantics actually apply. Keep both builders deterministic and free of network, storage, React, and browser-file APIs: the workflow supplies creation times, identifier values, and UUID-based full URLs. Retain the current emitted values, profiles, narratives, identifiers, references, and section order.

Define `CreateAdiPmoBundleInput` beside the PMO builder with the current patient, practitioner-role map, attester, facilitator, data-enterer, custodian, status, signed date, creation time, PDF data, and caller-generated identifier/full-URL values. Define `CreateAdiDocumentReferenceInput` beside the `DocumentReference` builder with the corresponding subject, author, authenticator, custodian, status, dates, jurisdiction, context period, Bundle URL, and caller-generated document/set identifiers. The ADI builder—not the page—owns the ADI profile, type/category codes, extension URLs, MIME type, description convention, and identifier-system constants.

Keep generic `DocumentReference` display derivation, Composition selection, referenced-Bundle detection, and attachment discovery in the advance-directive feature. `readAdiDocument` is an optional PACIO ADI enrichment layer: it returns `null` when the supplied resources are not recognized as PACIO ADI and otherwise returns only the ADI version, data-enterer, and facilitator fields shown above. It does not perform network or browser operations and does not own generic Bundle warnings. Preserve current Composition-versus-`DocumentReference` precedence. The feature must preserve the exact existing warnings for a failed referenced-Bundle load or a referenced Bundle without a Composition, and must continue silently omitting malformed or unsupported PDF attachments.

Document the reference path as `feature workflow -> PACIO ADI builders -> shared FHIR document helpers -> FHIR transport`. Do not require all IG behavior to live in one file; optimize for a shallow, explicit call path of two or three focused files.

## Step-by-Step Implementation

### Milestone 1: Establish characterization coverage

- Write tests against the existing public modules before moving or renaming them. Test `formatAdiVersionNumber` with UTC boundaries and invalid input, and test the current PMO Bundle and server `DocumentReference` builders using fixed inputs and deterministic UUID mocks.
- Assert resource profiles, codes, extensions, timestamps, narratives, entry order, and references individually rather than using opaque full snapshots. Save a deterministic representative pre-refactor Bundle and `DocumentReference` fixture for the final semantic comparison.
- Mock `fetch` to characterize FHIR URLs, headers, pagination merging, error parsing, `$everything` fallback-related requests, reference closure, and the two POST operations used during PMO creation.
- Add model tests for patient summaries and advance-directive extraction, including missing fields, unavailable Bundles, generic non-ADI `DocumentReference` resources, ADI resources, and current warning/fallback behavior.
- Remove `--passWithNoTests` from the `test` script after the first test file is added. This milestone is complete only when build, lint, and a non-empty test suite pass without changing production behavior.

### Milestone 2: Refactor the ADI creation vertical slice

- Move `normalizeBaseUrl` into `src/lib/fhir/url.ts` and import it from both FHIR transport and server storage so `lib` no longer depends on a feature. Type `createDocumentReference` to accept and return `DocumentReference` instead of generic `Resource`.
- Keep `client.ts` as the single, straightforward list of generic FHIR operations; organize it into transport, pagination, reads, searches, and writes with section comments rather than adding client abstractions.
- Add the transparent `createDocumentBundle` constructor with the exact contract described above. Require explicit Composition and supporting entries; do not introduce a schema, fluent builder, or IG abstraction framework.
- Move PMO Composition, source-form Binary, narratives, terminology, and Bundle construction into `src/igs/pacioAdi/pmoDocument.ts`; have it call `createDocumentBundle`.
- Move companion ADI `DocumentReference` construction into `src/igs/pacioAdi/documentReference.ts`. Rename `buildServerDocumentReference` to `buildAdiDocumentReference` and remove the unused generic `buildDocumentBundleReference`.
- Move ADI version formatting into `src/igs/pacioAdi/version.ts`. Keep profile URLs, identifier systems, LOINC concepts, temporary code-system values, status types, and input types beside the builder whose semantics they define; share a constant only when multiple ADI modules use it with the same meaning.
- Keep identifier/UUID generation, reference closure, server writes, and navigation outside the deterministic builders. Preserve the generated FHIR shape exactly, including the accepted temporary conformance deviations.
- Move `PatientPmoCreatePage.tsx` into `src/features/advanceDirectives/` without changing its route. Extract only pure option derivation, jurisdiction calculation, date conversion, identifier-value preparation, and input validation into `pmoFormModel.ts`.
- Put `File`-to-base64 conversion in `browserFiles.ts`, not in the form model. Keep browser file APIs out of `src/igs/` and pure model modules.
- Add `createPmoDocument.ts` as the small workflow coordinator: generate identifier/full-URL values; build the initial Bundle; close and rewrite references; POST the Bundle; build the companion ADI `DocumentReference` from the returned Bundle ID; and POST the `DocumentReference`.
- Preserve the existing two-write order, request bodies, success navigation, error text, and partial-failure behavior. Complete the milestone with passing build, lint, characterization tests, and pre/post resource-fixture comparison.

### Milestone 3: Refactor document reading and generic Bundle mechanics

- Move `AdvanceDirectiveDetailPage.tsx` into `src/features/advanceDirectives/` without changing its route. Keep generic `DocumentReference` metadata derivation in the feature so non-ADI advance directives continue to display.
- Create `src/igs/pacioAdi/adiDocument.ts` only for PACIO ADI detection and enrichment: version-extension parsing and facilitator/data-enterer interpretation. Return the explicit model contract above and do not perform Composition selection, generic attachment discovery, network calls, or browser operations.
- Add the reusable context-aware bundle index described above. Build it once per Bundle, pass the containing resource when resolving `#contained` references, and supply the normalized server base URL when same-server absolute references must resolve.
- Keep generic Composition selection and PDF attachment discovery in the advance-directive feature. Move base64 decoding, Blob URL creation, URL revocation, and `window.open` behavior into browser utilities there. Invalid or unsupported PDF data must retain the current silent omission behavior.
- In `closeBundleReferences`, fetch each wave of unique unresolved references with `Promise.all`, then append results in original reference order so output remains stable. Preserve recursive closure, error messages, deduplication, and URN rewriting behavior.
- Complete the milestone with passing build, lint, tests for generic and ADI detail behavior, and Bundle tests covering contained, relative, same-server absolute, external, duplicate, nested, and failed references.

### Milestone 4: Complete the broader organization and cleanup goals

- Retain `patientSummaryModel.ts` as the public composition point. Move demographic/contact extraction into `patientDemographics.ts`, and move Condition, MedicationStatement, AllergyIntolerance, Observation, and advance-directive list extraction into `clinicalSummary.ts`.
- Preserve current inclusion rules, ordering, truncation, placeholders, unavailable states, and the ten-item limit. Apply the limit in the model only; presentation components render the items they receive.
- Define clinical-list presentation interfaces in a small component-owned type module or directly in reusable component props, removing component imports from the patient-summary feature. Keep `AppLayout`'s server-context use because it is application-shell behavior.
- Remove `fetchPractitioners` only after the passing suite and a complete source search confirm no caller. Remove the PMO page's unused success-message state and rendering path.
- Use `AdiPmo...` for TypeScript symbols and `pacioAdi` for the IG directory. Avoid unrelated component abstractions and formatting-only rewrites.
- Keep one stylesheet. Add sections for shell, server pages, patient pages, advance-directive pages, shared forms/buttons, banners, and responsive rules; consolidate duplicate selectors only when computed behavior is unchanged, and remove selectors only after confirming no static or dynamic use.
- Complete the milestone with passing build, lint, and model/component tests plus manual visual comparison for affected pages.

### Milestone 5: Align documentation and perform final acceptance

- Update README to describe both read and PMO creation workflows, every FHIR endpoint used, root-level run commands, and the new directory ownership.
- Document the short reference path through `createPmoDocument.ts`, `pmoDocument.ts`, `documentReference.ts`, shared document-Bundle helpers, and transport. Explain which behavior is generic FHIR mechanics, generic advance-directive display, and PACIO ADI-specific construction or interpretation.
- Replace Vite-template prose with project-specific build, lint, and test instructions. Mark `IMPLEMENTATION_PLAN.md` as historical and direct readers to README and this plan for the current architecture.
- Document known temporary ADI conformance deviations as active-IG follow-up work without presenting them as settled implementation guidance or silently correcting them in this refactor.
- Run all automated and manual acceptance checks below. Remove `src/services/` only after all responsibilities have moved and no imports remain.

## Test and Acceptance Plan

- `npm run build` completes successfully.
- `npm run lint` completes with no warnings.
- `npm test` runs at least one test file and passes without `--passWithNoTests`.
- Builder tests confirm unchanged Bundle and `DocumentReference` semantics for fixed inputs.
- Shared document-constructor tests confirm document type, Composition-first ordering, timestamp handling, and unchanged supporting-entry order without asserting any IG-specific content.
- Network tests confirm unchanged endpoints, query parameters, request headers, two-POST order, and error messages.
- Bundle tests cover nested reference closure, deduplication, URN rewriting, relative references, same-server and external absolute references, containing-resource-scoped contained references, duplicate contained IDs in different resources, and a failed referenced-resource fetch.
- Model tests cover complete and sparse patients, `$everything` unavailable state, clinical sorting/filtering, generic non-ADI detail display, PACIO ADI enrichment and precedence, missing Composition, and malformed PDF data.
- Manual smoke testing confirms:
  - Connect, save, activate, delete, and disconnect server flows.
  - Patient list search and patient-summary fallback.
  - Advance-directive detail loading and PDF opening.
  - PMO form defaults, validation, creation, success notification, and navigation.
- Manual smoke testing is an accepted short-term human/environment-dependent gate; record which server and patient were used and any checks that could not be completed.
- Compare the checked-in pre-refactor fixture with post-refactor generated FHIR resources after normalizing UUIDs and creation timestamps; all other fields and entry ordering must match.

## Assumptions and Deferred Work

- `@types/fhir` and Vitest are already installed; no dependency addition or upgrade is part of this refactor.
- The PACIO ADI IG is under active development. This refactor will not pin an IG revision, refresh the IG mirror, or attempt to resolve known moving conformance targets.
- The refactor preserves current user-visible and FHIR-output behavior, including existing request limits, `$everything` parameters, two-step writes, and partial-write failure behavior.
- Known ADI conformance corrections are explicitly deferred to a separate change with then-current IG review, profile validation, and intentional output-change review.
- No router, state-management library, CSS framework, backend, caching layer, or additional FHIR client dependency will be introduced.
- Reuse is capability-oriented: generic FHIR mechanics may be shared across PACIO IGs, while IG-specific profiles and semantics remain explicit in focused modules.
- New abstractions must be justified by a mechanical invariant or demonstrated reuse; speculative cross-IG frameworks are out of scope.
