# PFE device reference implementation

These pure FHIR R4 builders and interpreters target PACIO PFE `3.0.0-ballot`, source commit `bb71c56087d0c8686d41178b07367386370d79fe` (2026-10-06), and its US Core `9.0.0` dependency. Profile rules, extension URLs, and demo terminology belong here; React, transport, destination matching, and browser behavior belong outside this directory.

`buildPfeDevice` constructs a PFE Device with type, names, optional UDI and Organization owner, and patient association. US Core permits at most one UDI carrier and requires its device identifier when present. UDI is not invented when absent.

`buildPfeDeviceRequest` constructs a request linked through `codeReference`. It supports Required and Must Support request fields, repeatable location and device-user extensions, and grouped clinical justification. The current profile prohibits `performer` and `performerType`; the builder never emits either. `interpretPfeDeviceRequest` reads these extensions, including Annotation justification notes and the additional requester extension on `requester`.

Builder inputs use FHIR types and validate key presence and choice constraints. They do not replace full FHIR profile or terminology validation and do not verify that referenced resources conform to their target profiles. The five assistive device types and parameter codes are deliberately small demo subsets; they are not full value-set expansions.

The browser form exposes a subset of allowed value representations and reference targets, including text or coded locations and basic repeating schedules. Further representations can be added without moving profile rules into the UI.

Creation uses separate Device and DeviceRequest writes, consistent with existing document creation. A rejected request leaves its Device on the destination and supports reuse for in-session retry. Transaction publication is a future enhancement.
