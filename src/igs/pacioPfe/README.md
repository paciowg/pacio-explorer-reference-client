# PFE reference implementation

These pure FHIR R4 builders and interpreters target PACIO PFE `3.0.0-ballot`, source commit `bb71c56087d0c8686d41178b07367386370d79fe` (2026-10-06), and its US Core `9.0.0` dependency. Profile rules, extension URLs, and demo terminology belong here; React, transport, destination matching, and browser behavior belong outside this directory.

`buildPfeDevice` constructs a PFE Device with type, names, optional UDI and Organization owner, and patient association. US Core permits at most one UDI carrier and requires its device identifier when present. UDI is not invented when absent.

`buildPfeDeviceRequest` constructs a request linked through `codeReference`. It supports Required and Must Support request fields, repeatable location and device-user extensions, and grouped clinical justification. The current profile prohibits `performer` and `performerType`; the builder never emits either. `interpretPfeDeviceRequest` reads these extensions, including Annotation justification notes and the additional requester extension on `requester`.

The builder also preserves optional, repeatable `reasonCode` and `reasonReference` independently of the clinical-justification extension. Neither is inferred from device type or required for creation; both can coexist. The browser's coded-reason transfer list uses a small subset of the targeted PFE profile's examples: reduced mobility, aphasia following cerebral infarction, chronic respiratory failure with hypoxia, and underweight. This is not a complete expansion of the US Core condition-code value set.

Reason references use a transfer list of destination-patient Condition, Observation, DiagnosticReport, and DocumentReference records loaded through the existing patient-reference workflow. The form validates the selected reference types and clears them when the destination changes. These are the [FHIR R4 DeviceRequest reasonReference targets](https://hl7.org/fhir/R4/devicerequest-definitions.html#DeviceRequest.reasonReference); broader PFE narrative examples involving CarePlan, ServiceRequest, and NutritionOrder do not expand the inherited target types. `basedOn` support remains separate future work.

Builder inputs use FHIR types and validate key presence and choice constraints. They do not replace full FHIR profile or terminology validation and do not verify that referenced resources conform to their target profiles. The five assistive device types and parameter codes are deliberately small demo subsets; they are not full value-set expansions.

The browser form exposes a subset of allowed value representations and reference targets, including text or coded locations and basic repeating schedules. Further representations can be added without moving profile rules into the UI.

The demo form omits supporting device-usage selections from clinical justification. The general-purpose builder and viewer continue to support existing `use-of-device` justification extensions.

For device details, the browser asks only for a device type and displays generated defaults as read-only text. `demoDeviceDefaults` uses the existing demo name, the `user-friendly-name` name type, and `DEMO-PFE-<device code>` for both the UDI device identifier and human-readable carrier. These synthetic identifiers are shared by device type and are not manufacturer-assigned UDIs. The general-purpose builder continues to accept caller-provided names and optional UDI; it does not generate demo values itself.

Creation uses separate Device and DeviceRequest writes, consistent with existing document creation. A rejected request leaves its Device on the destination and supports reuse for in-session retry. Transaction publication is a future enhancement.

## Nutrition orders

`buildPfeNutritionOrder` constructs the PFE NutritionOrder profile, which directly inherits FHIR R4 NutritionOrder. It supports the Required and Must Support fields for oral diets, supplements, and enteral formulas. Components can be combined; at least one must contain data. PFE additionally requires one or more `allergyIntolerance` references. The builder validates these requirements and administration rate choice exclusivity, then removes empty optional FHIR structures recursively. It does not perform full profile or terminology validation.

`nutritionTerminology.ts` provides small coded demo subsets. Diet, supplement, and thin-fluid choices come from the confirmed PFE example. Nutrient, texture, food, formula, additive, preference, and route choices use the corresponding [FHIR R4 NutritionOrder terminology](https://hl7.org/fhir/R4/nutritionorder.html#terminology); these subsets are not complete value-set expansions. Quantities emitted by the form use UCUM codes and basic repeat schedules.

The browser exposes two explicit allergy modes: existing destination-patient AllergyIntolerance records, or no known food allergies. In the second mode, it reuses the newest active destination record with SNOMED CT `429625007` and a verification status other than refuted or entered-in-error. If no eligible record exists, it creates a standalone AllergyIntolerance before posting NutritionOrder. The negative statement is never inferred from missing data. Its generic builder and eligibility checks live in `src/lib/fhir/allergies.ts`.

Destination Patient matching, reference loading, writes, and retry progress remain outside this IG directory. Writes are separate; a created Patient or allergy remains if NutritionOrder creation fails and is reused for an in-session retry. No contained allergy is emitted by creation, although viewing resolves contained references in existing orders. Patient allergy searches use their own endpoint rather than depending on `$everything`; a failed or incomplete search cannot be treated as absence.
