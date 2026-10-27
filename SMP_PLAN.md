# SMP implementation plan

Status: planning only. This document authorizes no implementation or external writes.
Prepared October 23, 2026, against the current repository implementation and the SMP sources linked below.

Implementation notes (October 26, 2026): the user subsequently authorized implementation. The pinned October 2 source includes an official SMP Bundle DocumentReference profile missed during initial planning, so the implementation uses that profile, LOINC `70006-2`, and its inherited required US Core category instead of the application-only indexing proposal below. See `src/igs/pacioSmp/README.md` and the baseline manifest for the implemented contract. The user explicitly moved independent FHIR/profile validation to a post-implementation step using separate tooling; repository tests, build, and lint remain implementation checks. This supersedes the requirement to finish external validation before implementation delivery. Live test-server writes remain unauthorized.

Creation workflow update: subsequent user testing supersedes the statement-eligibility and post-save UI requirements below. All patient-scoped MedicationStatements are selectable without SMP compatibility exclusions or labels, and those compatibility issues do not block collection publication. Patient identity, member resource types, authored List field requirements, reference closure, version conflicts, and write recovery remain enforced. Medication label lookup is optional enrichment. Successful List saves return to Documents with a standard success notification; the saved-List action panel, manual source reload, excluded-resource panel, and resource-inspection dropdown are removed. Changed choices still refresh automatically before renewed submission.

## 1. Outcome and decisions

Deliver two related workflows:

1. Create a reusable SMP medication List from existing patient MedicationStatements.
2. Publish an SMP collection containing one or more saved medication Lists and their supporting resources, indexed by a DocumentReference and accessible from the patient's Documents tab.

Confirmed with the user:

- Target a pinned revision of the SMP development guide rather than published STU1 alone.
- Save Lists as independent source-server resources so they can be selected for later collections.
- Permit existing compatible MedicationStatements without requiring an SMP declaration in `meta.profile`; never modify or relabel those source resources automatically.
- Permit collection publication to any saved FHIR server. The active server remains the source and default destination.
- Defer MedicationStatement/adherence creation and MedicationRequest creation.

Implementation defaults chosen by this plan:

- Newly authored Lists use `mode = snapshot` and `status = current`. Working-list maintenance, change lists, editing, deletion, replacement, and version lineage are deferred.
- Independent Lists are created only on the active source server. Publishing a collection does not create independent Lists, statements, or medication orders on the destination.
- Collections are application snapshots and are never updated by this workflow. A later publication creates a new collection and index.
- Use separate resource writes with explicit progress and recovery, consistent with existing application workflows. Do not require FHIR transaction support.
- Keep both SMP collections and reusable medication Lists accessible under Documents. Preserve the existing Current Medications section and its behavior.
- No new runtime dependencies are expected. Adding dependencies, installing validation tooling, or updating external caches requires the applicable user permission.

Success means a user can save two Lists, include both in one collection, publish to another saved server, and view each List's membership and medication details entirely from the destination Bundle. Shared statements appear once in the Bundle while retaining membership in both Lists.

## 2. Standards baseline and conformance

### Freeze the development baseline before implementation

The current development pages are mutable, and their displayed version alone does not identify their contents. The inspection did not establish an exact commit SHA or a complete dependency lock. Do not invent either or claim that the baseline is already frozen.

The first implementation task is to resolve and record the latest SMP default-branch revision at or before October 23, 2026, from `HL7/smp-ig`. Record its full commit SHA, source date, package identity, exact dependencies, terminology versions, and the matching generated StructureDefinitions. Use the configured `fhir-ig-lookup` skill for FSH once its mirror is available; refresh only with required cache/network permission. Inspect resolved StructureDefinition snapshots for inherited requirements. Keep the selected artifacts and validation versions reproducible; never silently advance to a newer CI build during implementation.

Create a small baseline manifest and developer README under `src/igs/pacioSmp/` recording these facts and any known upstream validation issues. FSH is differential source, not proof of inherited cardinalities or bindings. If the pinned artifacts contradict the capabilities described here, document the conflict before implementing a workaround; do not silently relax the profile.

### FHIR requirements

- Build `Bundle.type = collection` using the SMP Bundle profile. Include at least one SMP List and put a selected List first, as required by the SMP formal specification. Do not add a Composition.
- Omit search/transaction-only fields, including `Bundle.total`, `entry.search`, `entry.request`, and `entry.response`. Do not repurpose a patient `$everything` Bundle as the collection envelope.
- New Lists declare `http://hl7.org/fhir/us/smp/StructureDefinition/smp-medication-list`; new collections declare `http://hl7.org/fhir/us/smp/StructureDefinition/smp-bundle`. Resolve all further constraints against the pinned artifacts.
- List author/source, patient, and list-type code are required by the inspected SMP List profile. `entry.item` refers to SMP-compatible MedicationStatements. Preserve required bindings and Must Support capabilities from the pinned baseline.
- Snapshot Lists must not use `entry.date` or `entry.deleted`. An empty List requires an explicit empty reason in this UI; never submit entries and `emptyReason` together.
- Generate safe human-readable narrative for authored Lists from their title, type, patient, source, date, and selected entries or explicit empty reason. Escape user/resource text; use existing safe narrative rendering conventions.
- Profile declarations are claims, not validation results. Run lightweight application checks for actionable errors and separately validate representative artifacts with the pinned FHIR validation packages. Do not claim comprehensive browser-side profile validation.

### Terminology and compatibility

- Obtain list-type choices from the pinned profile's Medication Lists value set. Check in a documented, versioned option set from that expansion; do not invent clinical codes or require a live terminology service for normal form use. Require an explicit list-type selection.
- For empty Lists, offer the applicable R4 list-empty-reason codes with plain labels, including unknown/unavailable information and an explicit no-medications assertion. Select no reason automatically. Confirm every offered code against the pinned binding.
- Check candidate statements for a valid status, exactly one medication choice, matching patient, permitted reference targets, and usable referenced medication content. Apply the same checks whether or not the SMP profile is declared.
- Missing optional or Must Support values do not automatically invalidate an individual resource; distinguish required cardinalities from implementation support obligations.
- Preserve source fields, identifiers, extensions, dosage, narratives, and clinical dates. Compatibility failures block use and identify the failing resource/field; do not fabricate missing clinical information or add an SMP declaration to copied statements merely to pass validation.

## 3. User experience and navigation

### Patient Documents

Add an SMP section with separately labelled reusable Lists and published collections, each with loading, error, empty, and unavailable states. Actions are **Create medication list** and **Create SMP collection**.

Use these hash-route paths and corresponding discriminated route variants:

- `/patients/:patientId/medication-lists/new`
- `/patients/:patientId/medication-lists/:listId`
- `/patients/:patientId/smp-collections/new`
- `/patients/:patientId/smp-collections/:documentReferenceId`

Register creation routes before parameterized detail routes. Cancel/back links return to `?view=documents`. Preserve existing ADI, TOC, Clinical Information, and FHIR viewer behavior. Use existing route notifications on success.

### Create a medication List

- Load the source Patient, patient MedicationStatements, candidate Lists, and eligible practitioner/role choices. Use dedicated paginated searches rather than relying on the summary's capped `$everything` response. Resolve referenced Medications needed to label and qualify choices.
- Require title, coded type, local calendar date, and author/source. Default the date to today; show snapshot mode and current status as explanatory read-only values. Notes are optional. No author is inferred from the browser user.
- Use `getRolePreferredReferenceOptions` for the PractitionerRole/Practitioner source field. Prefer roles and retain unpaired practitioners; retain exact resource type prefixes in this mixed-type field.
- Select statements with controlled `TransferList` values, `getResourceTransferChoices`, and `showDates`. Add timestamp support for MedicationStatement using asserted date, effective date, effective-period start, then labelled `meta.lastUpdated` fallback.
- Show medication display, statement status, and concise dosage information in the selection label/detail presentation, without polluting `Reference.display` with selection timestamps. Offer detail inspection before selection. Distinct statements about the same drug remain distinct choices.
- Do not reuse the Current Medications summary filter or display limit. Show compatible historical and not-taken statements; exclude entered-in-error statements from new selection. Display compatibility exclusions and their reasons separately.
- Require at least one selected statement or an explicit empty reason. Reject duplicate references, unavailable selections, and cross-patient entries. Changing to a nonempty selection clears the empty reason.
- On submission, re-read selected resources and recheck eligibility. If selected content changed since review, stop, refresh the affected details, and require renewed submission. Do not silently substitute newer content.
- POST one List to the active server; never write the selected statements. Retain the returned List and show a link to it. Allow returning to Documents or starting a collection with this List preselected using existing in-app navigation/state patterns.

### Create an SMP collection

> Updated workflow: collection creation is now one form with expandable List rows and independent checkboxes, followed by one Create action and return to the source patient Documents tab. Destination matching uses the shared TOC/ADI first-identifier/first-name-match helper without confirmation, with Patient copying when no match exists. Retained snapshot/write progress and uncertain-outcome safeguards remain. These decisions supersede the original transfer-list, review-step, strict-matching, and post-save navigation requirements below.

- Require title and at least one saved compatible patient List. Default title to `Medication profile for <patient name>`. Use a dated transfer list for List selection; add shared List timestamp support using `List.date`, then labelled last-update fallback.
- Existing working Lists may be included as captured resources; preserve their actual mode, entries, dates, and status. Do not relabel them as authored snapshot Lists. Exclude entered-in-error Lists. Preserve valid retired Lists and show their status.
- Load and validate all selected List memberships, including statements not present in the initial patient search. Do not drop unresolved entries or empty Lists.
- Show selected List types, dates, sources, membership counts, and explicit empty reasons. Explain that distinct Lists remain distinct; the app performs no reconciliation or conflict resolution.
- Use the existing destination-server control. Read-only destination patient lookup and collection preparation occur before publication. Changing destination invalidates destination-specific preparation and any unused publication progress.
- Provide a review step showing source and destination servers, destination patient match/copy result, selected Lists, statement/resource counts, and any limitations. Submission freezes this reviewed payload for retries.
- After same-server publication, open the collection detail page. After cross-server publication, offer **Open on destination**, switching to that saved server and using the destination patient/id route, and a separate return-to-source Documents link. Do not open a destination resource against the source server.

### Detail pages

- Standalone List details read the source List and resolve its references with existing resource detail helpers, showing partial-data warnings if reads fail.
- Collection details load the DocumentReference and its same-server Bundle attachment. Check index subject against the route patient and validate the collection patient identity before showing clinical content.
- Render index metadata followed by each embedded List, its status/mode/type/source/date, empty reason or member statements, and expandable medication/dosage details. Preserve stored List membership order inside detail views.
- Resolve snapshot details through the Bundle index, including URNs and contained references. Do not replace unavailable snapshot resources with live server reads. Make unresolved references visible without crashing or hiding other readable content.
- Show FHIR JSON links for the index and Bundle. If existing live-resource links are offered, label them as live views so users can distinguish them from snapshot details.
- Metadata remains readable when attachment loading fails. Unsupported/external attachments, malformed Bundles, and patient mismatches have explicit error states; do not assume the first entry is a Composition.

## 4. Resource construction, discovery, and transport

### Ownership and minimum interfaces

Keep pure SMP construction, terminology, compatibility checks, and interpretation under `src/igs/pacioSmp/`; keep React forms, server reads, and submission/retry coordination under `src/features/medicationProfiles/`. Follow the existing PFE separation. All new or modified TS/TSX modules need the required opening module comment.

Use FHIR R4 types and small explicit interfaces:

- `buildSmpMedicationList`: accepts identifier, title, type, patient/source references, date, notes, and statement references or empty reason; returns `List`.
- `validateSmpMedicationList` and `validateSmpMedicationStatement`: return structured issues containing severity, resource identity, path, and message; take a resolver where target compatibility is checked.
- `buildSmpCollection`: accepts the collection identifier, assembly instant, frozen selected Lists, and resolved resource entries; returns a new `Bundle` without transport metadata.
- `buildSmpDocumentReference`: accepts collection identifier, title, creation instant, destination patient, Bundle URL, and optional resolvable author; returns base R4 `DocumentReference`.
- Source loading functions return resources plus completeness information. Submission functions return created resource identities and retain explicit in-session progress rather than only a final DocumentReference.

Use existing `searchResources`, `readServerResource`, and `createResource` transport where suitable. Preserve existing ADI/TOC interfaces. The current `publishDocument` helper does not expose sufficient progress/retry state; use an SMP coordinator rather than changing all document workflows to fit SMP.

### DocumentReference indexing convention

Use an application-owned coding, not an invented SMP profile or unsupported clinical LOINC code:

- `status = current`; omit `docStatus`, since this is a collection rather than a Composition-based document lifecycle.
- `type.coding.system = https://paciowg.github.io/pacio-explorer-reference-client/CodeSystem/document-type`, `code = smp-collection`, display `SMP medication collection`.
- `description` and attachment title contain the entered title; `subject` references the destination Patient.
- `date` and attachment creation use the generated assembly instant. Attachment content type is `application/fhir+json`; URL is the destination's returned Bundle URL.
- Use a UUID identifier with `system = urn:ietf:rfc:3986`, value `urn:uuid:<uuid>` for the Bundle and matching `masterIdentifier` on its index. Create it once per publication session, preserving it on retry.
- Omit category and optional author when there is no appropriate value. A same-server index may use the first selected List's source as author; cross-server publication omits that index reference unless it resolves on the destination. Authorship remains represented on each embedded List.

Discovery searches patient DocumentReferences and recognizes the exact system/code pair. It does not classify arbitrary FHIR JSON attachments as SMP. Keep this convention documented for other producers. Collections authored elsewhere without this marker remain accessible through the generic FHIR viewer; broad legacy index recognition is deferred.

Discover reusable Lists through patient-scoped List searches and classify using the pinned medication-list profile or recognized medication-list codes plus compatibility checks. Do not treat every patient List as a medication List.

Paginate dedicated patient searches and independently verify resource subjects; search results alone do not establish scoping. If a configured safety cap leaves a next link, show an incomplete-results warning and prevent creation from silently incomplete choices. Search/read failures are not empty clinical lists. The summary can retain its established visible list limit, sorting before limiting; creation selectors must use their own complete result set.

### Collection preparation and reference resolution

Prepare and validate the full source snapshot before any destination write:

1. Re-read selected Lists, compare with reviewed resources, and resolve all members. Follow explicit versioned references at that version; never substitute the latest version when history is unavailable.
2. Traverse FHIR `Reference` values recursively, using a visited set and a 500-resource safety limit. Include the source Patient, Lists, statements, referenced Medications, authors, and other required supporting resources. Follow same-source relative and absolute references; resolve Bundle URNs and contained references in their owning context. Stop with a clear error on cap overflow or an unresolved required dependency.
3. Require all patient-bearing resources to refer to the selected source patient. Do not merge patients by coincidental logical id across servers. Preserve self/contained references and detect dangling references. Identifier-only references that cannot be resolved prevent a self-contained publication.
4. External-server references are not fetched automatically. Block publication and identify the reference that prevents portability. Do not silently omit it or leave a source dependency in a supposedly self-contained snapshot. Ordinary terminology canonicals and non-Reference URLs are not resources to crawl.
5. Deduplicate by source server, resource type, logical id, and version where present. Different versions of the same logical resource in one selected closure are a conflict in v1: report it and require the user to select compatible Lists rather than choosing a version silently.
6. Assign each included top-level resource one UUID `fullUrl`; rewrite internal relative, same-source absolute, and versioned references to the appropriate URN. Leave `#contained` references scoped to their owner. Preserve source resources' clinical content and metadata in copies, with no source-server writes.
7. Retain selected Lists in stable selected order, with the first List first. Additional resources follow a deterministic traversal order. Do not copy search envelope metadata.

Implement SMP portability as an explicit helper with source-base and version-aware resolution. Reuse safe low-level pieces of the existing Bundle index/reference utilities; do not assume `closeBundleReferences` and `withUrnUuidBundleReferences` already handle these cases. Avoid broad behavioral changes to ADI and TOC; any shared fix requires their regression tests.

Use local date-only values for List dates where the pinned datatype permits; generated Bundle/index creation times remain instants. Preserve existing partial dates and zoned timestamps, use shared date formatting, and never parse display strings. List summaries sort by List date; collection summaries by index date; transfer choices use shared clinical-date precedence. Use stable `compareDatesDesc`, with missing/invalid dates last.

## 5. Destination publication and failure behavior

Publication state records the frozen payload, identifiers, source/destination identity, destination Patient, created Bundle URL, created index, and any uncertain write stage.

1. Validate the source snapshot and read destination capabilities for Patient matching/creation, Bundle creation, and DocumentReference creation. Explicitly unsupported operations block the workflow; absent detail gets a warning and actual responses remain authoritative.
2. Resolve the destination Patient. For SMP, use a scoped matching wrapper: collect complete-identifier matches, require a unique consistent patient, and stop on ambiguous/conflicting matches. If only a unique name match is available, show it for explicit selection in review; never silently take the first name match. If no match is selected/found, show that a Patient copy will be created on submission. Do not change matching behavior in existing workflows.
3. On submission, create a destination Patient only when necessary, stripping source id/meta through the existing portable-copy approach. Retain a successfully created patient for retry. A failed search never triggers patient creation.
4. The embedded Patient remains the captured source Patient addressed by its internal URN. Embedded patient references point to that URN. The external DocumentReference.subject points to the matched/copied destination Patient. Do not replace source clinical demographics with a destination record or leak source-relative patient references into the index.
5. POST the frozen collection to `/Bundle`; store the returned URL/id. POST the DocumentReference pointing to it. Do not POST the embedded resources individually or execute the collection as a transaction.
6. If index creation returns a definite rejection, retain the Bundle URL and offer **Retry indexing**, reusing that Bundle and identifier. Lock title, destination, and selections once the Bundle exists. Starting another collection is an explicit action and leaves prior resources intact.
7. Network interruption, malformed success responses, missing accepted resource ids, and server failures that leave commit status unknown are uncertain outcomes. Show the stage and known resource URLs, prevent automatic/repeated writes, and require destination verification before starting another submission. Do not implement rollback deletes.
8. Progress is in memory for the form session only. State explicitly that reloading loses retry state; preserve visible identities for manual recovery. Do not persist patient resources in local storage or add logging of clinical payloads.

Handle accepted writes with representation or a same-server Location/Content-Location header, following existing generic transport support. Prevent duplicate clicks and destination changes during submission. Recoverable validation/server errors retain form inputs.

## 6. Implementation sequence

1. **Freeze standards and fixtures:** resolve the baseline/dependencies, capture a conformance matrix and versioned terminology, and prepare de-identified fixtures for two overlapping Lists, compatible undeclared statements, and cross-server references. This is a prerequisite, not permission to update dependency manifests.
2. **Pure SMP layer:** implement List and collection builders, index convention, compatibility issues, and interpretation helpers. Verify cardinalities, invariants, references, and nonmutation with focused unit tests.
3. **Read/resolve layer:** add patient-scoped discovery, completeness tracking, selection models, timestamps, author options, and version-aware snapshot closure. Test all supported reference forms before enabling publication.
4. **Reusable List workflow:** add creation/detail routes and UI, save behavior, source-server retries, and Documents integration. A standalone List save must work without publishing a collection.
5. **Collection workflow:** add selection/review, destination matching, frozen snapshot publication, staged recovery, and cross-server navigation.
6. **Snapshot viewer and regression checks:** render multiple embedded Lists and shared statements, add explicit partial-data states, and verify existing ADI/TOC and Current Medications behavior.
7. **Documentation and acceptance:** document the baseline, indexing convention, limits, snapshot semantics, destination behavior, and deferred capabilities in the README and SMP developer notes. Complete the validation below before considering the feature finished.

Keep changes patch-sized and narrowly scoped. Preserve user changes, existing comments, and established styles. No migration of stored data is required. No commits, pushes, pull requests, publishing, or deployment are part of this plan.

## 7. Validation and acceptance

### Automated checks

- Builders: required fields, exact profile URLs, snapshot/current defaults, valid list-type coding, empty reasons versus entries, escaped narrative, valid collection envelope, first List, stable identifiers, and input immutability.
- Eligibility: declared and undeclared compatible statements, required-field failures, all permitted clinical statuses, exclusion of entered-in-error resources, duplicate references, distinct statements for the same medication, and patient mismatch.
- Selection/discovery: dedicated pagination, incomplete-search detection, stable newest-first date ordering, partial dates/timezones, shared role preference, and preservation of unprefixed FHIR displays.
- Closure: overlapping Lists share one statement entry; different List memberships remain intact; same-server absolute/relative/history references, URNs, contained resources, cycles, missing dependencies, external references, version conflicts, and cap overflow.
- Publication: same-server and cross-server paths, unique/conflicting identifier matches, explicit name match review, no-match Patient copy, search failure, destination changes, accepted writes with Location, partial success, index-only retry, uncertain outcome, and duplicate-click prevention.
- Viewing/routes: all four routes, creation-before-detail matching, Documents return links, destination navigation, multiple Lists, empty Lists, no Composition, unreadable attachments, patient mismatch, and snapshot rendering without live fallback.
- Regression: existing ADI/TOC publishing, Bundle helpers/index resolution, patient sections, and shared transfer-list date/focus behavior.

Use the existing Vitest/component-test conventions and meaningful request mocks. Do not add a test framework or browser automation dependency for this change.

### Standards and manual checks

- Validate representative List, collection Bundle, and base R4 DocumentReference artifacts with the exact pinned packages and a recorded validator version. Validate undeclared included statements explicitly against the SMP profile. Report imported-resource/dependency errors separately from generated-resource errors; do not hide unsupported validation findings.
- Test the UI on narrow and wide screens, keyboard-only transfer actions, focus retention, disabled submission, empty/error states, and date-only versus timestamp displays.
- With separately authorized test-server writes, create two Lists from existing statements, publish a collection to the source and then another saved server, inspect posted JSON, and confirm both indexes are discoverable for the correct patient.
- Change a source statement after publication and confirm the destination viewer still displays the captured statement. Confirm destination searches do not imply that embedded statements/Lists were independently created there.
- Reproduce a definite index failure and confirm retry does not create a second Bundle. Simulate an uncertain write with mocks; do not create duplicate clinical resources to test it manually.
- Run `npm test`, `npm run build`, and `npm run lint`. Record results and unresolved limitations. Any unavailable external validator or unauthorized live write remains explicitly unverified, not silently passed.

Acceptance requires the end-to-end outcome in section 1, passing standard project checks, reproducible profile validation evidence, and no unintended source-resource modifications. Lack of server `$everything` support must not prevent dedicated SMP searches when standard resource searches are available.

## 8. Deferred work and references

MedicationStatement authoring/adherence and MedicationRequest authoring are separate follow-up designs. Preserve and display existing data supported by the current viewer, but do not add their forms, synthetic adherence extensions, medication prescribing, reconciliation, fulfillment, or status-changing actions in this release. Before statement authoring, settle adherence extension identity/version and `basedOn` versus `derivedFrom` semantics. Before request authoring, settle recording an existing prescription versus issuing an order and its US Core, terminology, dosage, requester, and dispensing requirements.

Other deferred capabilities: mutable List maintenance, transaction Bundle maintenance operations, SMP history/submit operations, collection supersession, generalized external-server reads, automatic ingestion of collections into standalone destination resources, and full browser-side FHIR validation.

Authoritative sources inspected for planning (the implementation must replace mutable development references with its recorded revision/artifacts):

- [SMP source repository](https://github.com/HL7/smp-ig)
- [Development SMP Bundle profile](https://build.fhir.org/ig/HL7/smp-ig/StructureDefinition-smp-bundle.html)
- [Development SMP medication List profile](https://build.fhir.org/ig/HL7/smp-ig/StructureDefinition-smp-medication-list.html)
- [Development SMP MedicationStatement profile](https://build.fhir.org/ig/HL7/smp-ig/StructureDefinition-smp-medicationstatement.html)
- [Published STU1 formal specification](https://hl7.org/fhir/us/smp/specification.html)
- [FHIR R4 MedicationStatement](https://hl7.org/fhir/R4/medicationstatement.html)

Repository anchors: `src/lib/fhir/documentPublishing.ts` currently performs separate writes without retained retry progress; `src/lib/fhir/bundleReferences.ts` and `closedBundle.ts` need explicit reference-form review before reuse; `src/lib/fhir/resourceTransport.ts` provides paginated search and resource creation with Location handling. Existing date, resource-choice, transfer-list, route, and destination forms supply the established UI conventions.
