# SMP implementation

The pure builders and compatibility checks target `HL7/smp-ig` commit [`21d84d654dc2f9e835a87049b5116bc4f55f2415`](https://github.com/HL7/smp-ig/tree/21d84d654dc2f9e835a87049b5116bc4f55f2415), dated October 2, 2026. `baseline/manifest.json` records the generated package date, exact package dependency declarations, and SHA-256 hashes of the checked-in resolved profiles and list-type value set. These artifacts are read from the matching October 2 cached development package, not the published STU1 package. They are used for implementation reference and tests and are not loaded into the browser bundle.

FHIR R4 `4.0.1` and US Core `8.0.1` are the principal dependencies. The manifest also records the guide's alternate US Core packages, terminology packages, and cross-version extension package. No runtime dependency was added. Future baseline updates must be intentional and review changes to inherited snapshots as well as FSH differentials.

## Conformance boundaries

| Resource | Implemented construction/checks |
| --- | --- |
| SMP List | Required coded type, Patient subject and practitioner/role source; snapshot/current creation; explicit empty reason or unique statement references; date-only input and escaped narrative. Existing working/change/retired Lists retain their semantics when captured. |
| SMP MedicationStatement | List creation accepts all patient-scoped statements, including incomplete or entered-in-error statements, without profile-based exclusions or labels. Statement authoring supports coded medication/Medication references, optional existing MedicationRequest linkage with lossless locked dosage copying, dates, sources, dosage, adherence, selected clinical context, and notes. All status/adherence combinations remain permitted for the demo. Collection construction checks member type, patient identity, and reference resolution. The standalone compatibility validator is not a creation/publication gate; existing imported fields and extensions remain unchanged. |
| SMP collection Bundle | Collection type, List first, one or more Lists, stable UUID fullUrls, reference closure/deduplication, version conflict detection, and no search/transaction envelope fields. |
| SMP DocumentReference | Official profile, LOINC `70006-2`, required inherited category, date, patient, content type and attachment creation. UUID masterIdentifier and identifier match the collection identifier. |

These checks do not perform full profile/terminology validation or prove that imported resources conform to referenced US Core profiles. Required fields and Must Support are distinct; optional values are not fabricated. The imported Patient and other supporting resources can still require corrections identified by external validation.

Medication-name resolution enriches selector labels only. Failed or unavailable Medication reads do not hide statements or block List saving; a collection still requires resolution of its referenced resources. List saves recheck selected statements and their author for freshness, retain the required authored List fields, and return to the patient Documents tab with the standard success notification. Changed choices refresh automatically for renewed submission. The creation form has no manual reload, excluded-resource panel, resource-inspection dropdown, or post-save action panel.

### Correction to the original plan

The pinned source contains `SMPBundleDocumentReference`, which was absent from the earlier web-based planning inspection. Its resolved snapshot requires a category inherited from US Core. The implementation therefore declares `http://hl7.org/fhir/us/smp/StructureDefinition/smp-bundle-documentreference`, uses LOINC `70006-2` (Medication Management Note), and supplies the US Core `clinical-note` category. It does not use the originally proposed application-only type code. Same-server index authors are optional PractitionerRole references; bare Practitioner List sources are not copied into that narrower author field.

### Terminology

The eight medication List types come from VSAC `2.16.840.1.113762.1.4.1096.240`, package `us.nlm.vsac#0.24.0`, expansion timestamp May 23, 2025, LOINC `2.80`. The UI shortens the expansion's display names; the clinical code and version remain explicit. The checked-in value set contains the original displays and expansion metadata.

Empty reasons use the FHIR R4 list-empty-reason codes. No reason is selected by default. Choosing an empty reason is a clinical assertion; failed or incomplete searches are never translated into an empty medication List.

## Application ownership and storage

React, source/destination reads, patient matching, publication progress, and snapshot reference resolution live in `src/features/medicationProfiles/`. Builders do not fetch resources or mutate their inputs. Independent Lists are saved on the active source server. Collection publication writes a destination Patient only when needed, then the collection Bundle and DocumentReference. Its embedded resources are not posted as independent destination resources.

Dedicated searches are capped at 500 results and reject incomplete pages for creation. Closure has a separate 500-resource limit. External-server, unresolved source UUID, and identifier-only references stop publication with an actionable error; there is no automatic external resource crawl. Source UUID references need a containing source Bundle context that standalone REST resources do not provide. Explicit historical references require their actual version. An historical version is never silently used for an unversioned reference, and conflicting versions of one logical resource stop collection creation.

Destination matching uses the shared TOC/ADI matching helper: reuse the same-server Patient, otherwise take the first identifier match, then the first family/given-name match, or create a Patient copy if none exists. A failed lookup cannot trigger Patient creation. The single-page collection form supports independent selection and lazy expansion of saved Lists; successful publication returns to the source patient Documents tab. The external index references the destination Patient, while the collection retains its captured source Patient and internal URN references.

Publication retains created Patient/Bundle identities in memory. A definite index rejection offers index-only retry. Network interruptions, 5xx responses, timeouts, malformed accepted responses, and accepted resources without usable identities block automatic retry because the write outcome is uncertain. Reloading loses the recovery state; no patient payloads are persisted to browser storage and no rollback deletes are attempted.

Snapshot views use embedded resources only. They check index and internal patient boundaries, preserve List membership, show unresolved references, and never replace captured content with newer live resources.

## Post-implementation validation

Independent FHIR/profile/terminology validation is explicitly deferred at the user's request (October 26, 2026) to separate tooling. Live test-server publication and visual browser acceptance have not been performed by this implementation. Repository unit/markup tests, TypeScript build, and lint are separate checks and do not replace that validation.

Use the separate tooling to validate authored Lists, explicit empty Lists, undeclared MedicationStatements, multi-List collections with shared statements, and their SMP DocumentReferences. Validate undeclared statements explicitly against the pinned SMP profile. Use the manifest's exact dependency versions and record the external validator version and any imported-resource versus generated-resource findings.

Statement authoring lives in `src/features/medicationStatements/`; its pure builder and sample-data terminology live in `medicationStatement.ts` here. It reuses shared destination Patient matching and the guarded SMP write transport. The sample catalog uses the 20 unique user-supplied RxNorm codes/displays without independent terminology verification. Formal validation should include newly authored statements with and without basedOn, manually entered dosage, and adherence; imported request dosage remains complete even beyond the editable subset.

Limited updates use a separate edit model: clone the full live statement, modify only explicitly changed status/adherence/reason fields, and append new notes. They preserve external resource content and profile declarations without asserting SMP conformance or refreshing basedOn medication/dosage. The update action exists only in the patient's Medications section, not in Lists or captured collections. PUT targets the original identity on the active server. Concurrency protection, unknown-extension interpretation, and narrative reconciliation are deliberately deferred for the demo; version-aware updates are a future improvement. Formal external validation should also cover amended externally authored resources.

Adherence reasons are a deliberately small seven-code subset of the [FHIR R5 reason-medication-status-codes expansion](https://hl7.org/fhir/R5/valueset-reason-medication-status-codes.html), which identifies SNOMED CT International edition July 31, 2022 as its expansion basis. Both forms use a dropdown with None selected, the presets, and Other. Presets include the SNOMED coding system, code, and published display; UI labels are separate. Other requires text, submitted as `CodeableConcept.text` rather than a synthetic code. Update selection matches by system/code, adds an Existing option for unsupported coding, and loads text-only reasons into Other. Unedited original concepts remain intact, including original text or mixed coding/text; there is no automatic mapping of free text to codes.

Deferred capabilities remain MedicationRequest authoring/prescribing, reconciliation, mutable List maintenance, transactions, history/submit operations, replacement lineage, and automatic creation of embedded destination resources.
