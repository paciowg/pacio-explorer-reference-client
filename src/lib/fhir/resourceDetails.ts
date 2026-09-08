/** Builds reusable, presentation-neutral detail models for clinical FHIR resources without fetching external data. */
import type {
  AllergyIntolerance,
  Annotation,
  CarePlan,
  CodeableConcept,
  Composition,
  Condition,
  Device,
  DeviceRequest,
  DiagnosticReport,
  DocumentReference,
  Dosage,
  Encounter,
  Goal,
  Immunization,
  List,
  Medication,
  MedicationRequest,
  MedicationStatement,
  Observation,
  Period,
  Procedure,
  Quantity,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  Range,
  Reference,
  Resource,
  ServiceRequest,
} from 'fhir/r4'
import { formatDate, getCodeableConceptText } from './formatters'
import { getSimpleResourceDisplay } from './resourceDisplay'

export type ResourceDetailField = {
  label: string
  values: string[]
  multiline?: boolean
}

export type ResourceDetailGroup = {
  title?: string
  fields: ResourceDetailField[]
}

export type ResourceDetailModel = {
  groups: ResourceDetailGroup[]
}

export type ResolveResourceReference = (
  reference: string | undefined,
  containingResource?: Resource,
) => Resource | undefined

const ASSERTED_DATE_EXTENSION = 'http://hl7.org/fhir/StructureDefinition/condition-assertedDate'

function compact(values: Array<string | undefined | null>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
}

function field(
  label: string,
  value: string | Array<string | undefined> | undefined,
  multiline = false,
): ResourceDetailField | null {
  const values = Array.isArray(value) ? compact(value) : compact([value])
  return values.length ? { label, values, ...(multiline ? { multiline: true } : {}) } : null
}

function model(...groups: Array<ResourceDetailGroup | null>): ResourceDetailModel | null {
  const populated = groups
    .filter((group): group is ResourceDetailGroup => Boolean(group))
    .map((group) => ({ ...group, fields: group.fields.filter(Boolean) }))
    .filter((group) => group.fields.length)
  return populated.length ? { groups: populated } : null
}

function group(
  fields: Array<ResourceDetailField | null>,
  title?: string,
): ResourceDetailGroup | null {
  const populated = fields.filter((item): item is ResourceDetailField => Boolean(item))
  return populated.length ? { ...(title ? { title } : {}), fields: populated } : null
}

function humanize(value: string | undefined) {
  if (!value) return ''
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function concepts(values: CodeableConcept[] | undefined) {
  return compact(values?.map(getCodeableConceptText) ?? [])
}

function quantity(value: Quantity | undefined) {
  if (!value) return ''
  const amount = value.value != null ? `${value.comparator ?? ''}${value.value}` : ''
  return compact([amount, value.unit || value.code]).join(' ')
}

function range(value: Range | undefined) {
  if (!value) return ''
  const low = quantity(value.low)
  const high = quantity(value.high)
  if (low && high) return `${low} – ${high}`
  return low || high
}

function period(value: Period | undefined) {
  if (!value) return ''
  const start = value.start ? formatDate(value.start) : ''
  const end = value.end ? formatDate(value.end) : ''
  if (start && end) return `${start} – ${end}`
  return start ? `From ${start}` : end ? `Until ${end}` : ''
}

function choice(
  dateTime?: string,
  periodValue?: Period,
  stringValue?: string,
  quantityValue?: Quantity,
  rangeValue?: Range,
) {
  return dateTime ? formatDate(dateTime) : period(periodValue) || stringValue || quantity(quantityValue) || range(rangeValue)
}

function notes(values: Annotation[] | undefined) {
  return compact(values?.map((note) => note.text) ?? [])
}

function references(
  values: Reference[] | undefined,
  owner: Resource,
  resolve?: ResolveResourceReference,
) {
  return compact(values?.map((reference) => {
    const resolved = resolve?.(reference.reference, owner)
    return reference.display || (resolved ? getSimpleResourceDisplay(resolved) : '') || reference.reference
  }) ?? [])
}

function reference(
  value: Reference | undefined,
  owner: Resource,
  resolve?: ResolveResourceReference,
) {
  return references(value ? [value] : undefined, owner, resolve)[0] || ''
}

function dosage(value: Dosage) {
  if (value.text) return value.text
  const dose = quantity(value.doseAndRate?.[0]?.doseQuantity)
  const rate = quantity(value.doseAndRate?.[0]?.rateQuantity) || range(value.doseAndRate?.[0]?.rateRange)
  return compact([
    dose,
    getCodeableConceptText(value.route),
    getCodeableConceptText(value.method),
    value.timing?.code ? getCodeableConceptText(value.timing.code) : undefined,
    rate ? `at ${rate}` : undefined,
  ]).join(' · ')
}

function conditionDetails(resource: Condition, resolve?: ResolveResourceReference) {
  const assertedDate = resource.extension?.find((extension) => extension.url === ASSERTED_DATE_EXTENSION)?.valueDateTime
  return model(group([
    field('Clinical status', getCodeableConceptText(resource.clinicalStatus)),
    field('Verification status', getCodeableConceptText(resource.verificationStatus)),
    field('Category', concepts(resource.category)),
    field('Severity', getCodeableConceptText(resource.severity)),
    field('Body site', concepts(resource.bodySite)),
    field('Onset', choice(resource.onsetDateTime, resource.onsetPeriod, resource.onsetString, resource.onsetAge, resource.onsetRange)),
    field('Abatement', choice(resource.abatementDateTime, resource.abatementPeriod, resource.abatementString, resource.abatementAge, resource.abatementRange)),
    field('Asserted date', assertedDate ? formatDate(assertedDate) : undefined),
    field('Recorded date', resource.recordedDate ? formatDate(resource.recordedDate) : undefined),
    field('Asserter', reference(resource.asserter, resource, resolve)),
    field('Recorder', reference(resource.recorder, resource, resolve)),
    field('Stage', compact(resource.stage?.flatMap((stage) => [getCodeableConceptText(stage.summary), getCodeableConceptText(stage.type)]) ?? [])),
    field('Evidence', compact(resource.evidence?.flatMap((evidence) => [
      ...concepts(evidence.code),
      ...references(evidence.detail, resource, resolve),
    ]) ?? [])),
    field('Notes', notes(resource.note), true),
  ]))
}

function allergyDetails(resource: AllergyIntolerance, resolve?: ResolveResourceReference) {
  const reactionGroups = resource.reaction?.map((reaction, index) => group([
    field('Substance', getCodeableConceptText(reaction.substance)),
    field('Manifestations', concepts(reaction.manifestation)),
    field('Description', reaction.description, true),
    field('Onset', reaction.onset ? formatDate(reaction.onset) : undefined),
    field('Severity', humanize(reaction.severity)),
    field('Exposure route', getCodeableConceptText(reaction.exposureRoute)),
    field('Notes', notes(reaction.note), true),
  ], `Reaction ${index + 1}`)) ?? []
  return model(group([
    field('Clinical status', getCodeableConceptText(resource.clinicalStatus)),
    field('Verification status', getCodeableConceptText(resource.verificationStatus)),
    field('Type', humanize(resource.type)),
    field('Category', resource.category?.map(humanize)),
    field('Criticality', humanize(resource.criticality)),
    field('Onset', choice(resource.onsetDateTime, resource.onsetPeriod, resource.onsetString, resource.onsetAge, resource.onsetRange)),
    field('Recorded date', resource.recordedDate ? formatDate(resource.recordedDate) : undefined),
    field('Last occurrence', resource.lastOccurrence ? formatDate(resource.lastOccurrence) : undefined),
    field('Recorder', reference(resource.recorder, resource, resolve)),
    field('Asserter', reference(resource.asserter, resource, resolve)),
    field('Notes', notes(resource.note), true),
  ]), ...reactionGroups)
}

function observationValue(resource: Observation) {
  return quantity(resource.valueQuantity) || getCodeableConceptText(resource.valueCodeableConcept) ||
    resource.valueString || (resource.valueBoolean != null ? String(resource.valueBoolean) : '') ||
    (resource.valueInteger != null ? String(resource.valueInteger) : '') || range(resource.valueRange) ||
    (resource.valueRatio ? `${quantity(resource.valueRatio.numerator)} / ${quantity(resource.valueRatio.denominator)}` : '') ||
    resource.valueTime || (resource.valueDateTime ? formatDate(resource.valueDateTime) : '') || period(resource.valuePeriod)
}

function observationDetails(resource: Observation, resolve?: ResolveResourceReference) {
  const componentGroups = resource.component?.map((component) => group([
    field('Value', quantity(component.valueQuantity) || getCodeableConceptText(component.valueCodeableConcept) || component.valueString || range(component.valueRange)),
    field('Interpretation', concepts(component.interpretation)),
    field('Reference range', component.referenceRange?.map((item) => range({ low: item.low, high: item.high }))),
  ], getCodeableConceptText(component.code) || 'Component')) ?? []
  return model(group([
    field('Status', humanize(resource.status)),
    field('Category', concepts(resource.category)),
    field('Value', observationValue(resource)),
    field('Data absent reason', getCodeableConceptText(resource.dataAbsentReason)),
    field('Interpretation', concepts(resource.interpretation)),
    field('Effective', choice(resource.effectiveDateTime, resource.effectivePeriod)),
    field('Issued', resource.issued ? formatDate(resource.issued) : undefined),
    field('Body site', getCodeableConceptText(resource.bodySite)),
    field('Method', getCodeableConceptText(resource.method)),
    field('Performer', references(resource.performer, resource, resolve)),
    field('Specimen', reference(resource.specimen, resource, resolve)),
    field('Reference range', resource.referenceRange?.map((item) => range({ low: item.low, high: item.high }))),
    field('Notes', notes(resource.note), true),
  ]), ...componentGroups)
}

function diagnosticReportDetails(resource: DiagnosticReport, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Category', concepts(resource.category)),
    field('Effective', choice(resource.effectiveDateTime, resource.effectivePeriod)),
    field('Issued', resource.issued ? formatDate(resource.issued) : undefined),
    field('Performer', references(resource.performer, resource, resolve)),
    field('Results interpreter', references(resource.resultsInterpreter, resource, resolve)),
    field('Specimens', references(resource.specimen, resource, resolve)),
    field('Results', references(resource.result, resource, resolve)),
    field('Conclusion', resource.conclusion, true),
    field('Conclusion codes', concepts(resource.conclusionCode)),
    field('Presented forms', resource.presentedForm?.map((attachment) => attachment.title || attachment.contentType || attachment.url)),
  ]))
}

function procedureDetails(resource: Procedure, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Status reason', getCodeableConceptText(resource.statusReason)),
    field('Category', getCodeableConceptText(resource.category)),
    field('Performed', choice(resource.performedDateTime, resource.performedPeriod, resource.performedString, resource.performedAge, resource.performedRange)),
    field('Reason', [...concepts(resource.reasonCode), ...references(resource.reasonReference, resource, resolve)]),
    field('Body site', concepts(resource.bodySite)),
    field('Performer', resource.performer?.map((performer) => compact([
      getCodeableConceptText(performer.function),
      reference(performer.actor, resource, resolve),
    ]).join(': '))),
    field('Location', reference(resource.location, resource, resolve)),
    field('Outcome', getCodeableConceptText(resource.outcome)),
    field('Reports', references(resource.report, resource, resolve)),
    field('Complications', [...concepts(resource.complication), ...references(resource.complicationDetail, resource, resolve)]),
    field('Follow-up', concepts(resource.followUp)),
    field('Notes', notes(resource.note), true),
  ]))
}

function serviceRequestDetails(resource: ServiceRequest, resolve?: ResolveResourceReference) {
  const quantityValue = quantity(resource.quantityQuantity) ||
    (resource.quantityRatio ? `${quantity(resource.quantityRatio.numerator)} / ${quantity(resource.quantityRatio.denominator)}` : '') ||
    range(resource.quantityRange)
  return model(group([
    field('Status', humanize(resource.status)),
    field('Intent', humanize(resource.intent)),
    field('Priority', humanize(resource.priority)),
    field('Category', concepts(resource.category)),
    field('Quantity', quantityValue),
    field('Occurrence', choice(resource.occurrenceDateTime, resource.occurrencePeriod)),
    field('Authored date', resource.authoredOn ? formatDate(resource.authoredOn) : undefined),
    field('Requester', reference(resource.requester, resource, resolve)),
    field('Performer', references(resource.performer, resource, resolve)),
    field('Performer type', getCodeableConceptText(resource.performerType)),
    field('Location', [...concepts(resource.locationCode), ...references(resource.locationReference, resource, resolve)]),
    field('Reason', [...concepts(resource.reasonCode), ...references(resource.reasonReference, resource, resolve)]),
    field('Body site', concepts(resource.bodySite)),
    field('Specimens', references(resource.specimen, resource, resolve)),
    field('Supporting information', references(resource.supportingInfo, resource, resolve)),
    field('Patient instruction', resource.patientInstruction, true),
    field('Notes', notes(resource.note), true),
  ]))
}

function immunizationDetails(resource: Immunization, resolve?: ResolveResourceReference) {
  const occurrence = resource.occurrenceDateTime ? formatDate(resource.occurrenceDateTime) : resource.occurrenceString
  return model(group([
    field('Status', humanize(resource.status)),
    field('Status reason', getCodeableConceptText(resource.statusReason)),
    field('Occurrence', occurrence),
    field('Primary source', resource.primarySource != null ? (resource.primarySource ? 'Yes' : 'No') : undefined),
    field('Site', getCodeableConceptText(resource.site)),
    field('Route', getCodeableConceptText(resource.route)),
    field('Dose quantity', quantity(resource.doseQuantity)),
    field('Manufacturer', reference(resource.manufacturer, resource, resolve)),
    field('Lot number', resource.lotNumber),
    field('Expiration date', resource.expirationDate ? formatDate(resource.expirationDate) : undefined),
    field('Location', reference(resource.location, resource, resolve)),
    field('Performer', resource.performer?.map((performer) => compact([
      getCodeableConceptText(performer.function),
      reference(performer.actor, resource, resolve),
    ]).join(': '))),
    field('Reason', [...concepts(resource.reasonCode), ...references(resource.reasonReference, resource, resolve)]),
    field('Reactions', resource.reaction?.map((reaction) => compact([
      reaction.date ? formatDate(reaction.date) : undefined,
      reference(reaction.detail, resource, resolve),
      reaction.reported != null ? `Reported: ${reaction.reported ? 'yes' : 'no'}` : undefined,
    ]).join(' · '))),
    field('Protocol', resource.protocolApplied?.map((protocol) => compact([
      protocol.series,
      protocol.doseNumberPositiveInt != null ? `Dose ${protocol.doseNumberPositiveInt}` : protocol.doseNumberString,
      protocol.seriesDosesPositiveInt != null ? `of ${protocol.seriesDosesPositiveInt}` : protocol.seriesDosesString,
    ]).join(' '))),
    field('Notes', notes(resource.note), true),
  ]))
}

function medicationDetails(resource: Medication, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Form', getCodeableConceptText(resource.form)),
    field('Manufacturer', reference(resource.manufacturer, resource, resolve)),
    field('Amount', resource.amount ? `${quantity(resource.amount.numerator)} / ${quantity(resource.amount.denominator)}` : undefined),
    field('Ingredients', resource.ingredient?.map((ingredient) => {
      const item = getCodeableConceptText(ingredient.itemCodeableConcept) || reference(ingredient.itemReference, resource, resolve)
      const strength = ingredient.strength ? `${quantity(ingredient.strength.numerator)} / ${quantity(ingredient.strength.denominator)}` : ''
      return compact([item, strength]).join(' · ')
    })),
    field('Lot number', resource.batch?.lotNumber),
    field('Expiration date', resource.batch?.expirationDate ? formatDate(resource.batch.expirationDate) : undefined),
  ]))
}

function medicationRequestDetails(resource: MedicationRequest, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Status reason', getCodeableConceptText(resource.statusReason)),
    field('Intent', humanize(resource.intent)),
    field('Category', concepts(resource.category)),
    field('Priority', humanize(resource.priority)),
    field('Medication', getCodeableConceptText(resource.medicationCodeableConcept) || reference(resource.medicationReference, resource, resolve)),
    field('Authored date', resource.authoredOn ? formatDate(resource.authoredOn) : undefined),
    field('Requester', reference(resource.requester, resource, resolve)),
    field('Performer', reference(resource.performer, resource, resolve)),
    field('Reason', [...concepts(resource.reasonCode), ...references(resource.reasonReference, resource, resolve)]),
    field('Dosage instructions', resource.dosageInstruction?.map(dosage)),
    field('Dispense quantity', quantity(resource.dispenseRequest?.quantity)),
    field('Expected supply duration', quantity(resource.dispenseRequest?.expectedSupplyDuration)),
    field('Substitution allowed', resource.substitution?.allowedBoolean != null ? (resource.substitution.allowedBoolean ? 'Yes' : 'No') : getCodeableConceptText(resource.substitution?.allowedCodeableConcept)),
    field('Notes', notes(resource.note), true),
  ]))
}

function medicationStatementDetails(resource: MedicationStatement, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Status reason', resource.statusReason?.map(getCodeableConceptText)),
    field('Category', getCodeableConceptText(resource.category)),
    field('Medication', getCodeableConceptText(resource.medicationCodeableConcept) || reference(resource.medicationReference, resource, resolve)),
    field('Effective', choice(resource.effectiveDateTime, resource.effectivePeriod)),
    field('Date asserted', resource.dateAsserted ? formatDate(resource.dateAsserted) : undefined),
    field('Information source', reference(resource.informationSource, resource, resolve)),
    field('Reason', [...concepts(resource.reasonCode), ...references(resource.reasonReference, resource, resolve)]),
    field('Dosage', resource.dosage?.map(dosage)),
    field('Notes', notes(resource.note), true),
  ]))
}

function listDetails(resource: List, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Mode', humanize(resource.mode)),
    field('Code', getCodeableConceptText(resource.code)),
    field('Date', resource.date ? formatDate(resource.date) : undefined),
    field('Source', reference(resource.source, resource, resolve)),
    field('Ordered by', getCodeableConceptText(resource.orderedBy)),
    field('Empty reason', getCodeableConceptText(resource.emptyReason)),
    field('Entries', resource.entry?.map((entry) => compact([
      reference(entry.item, resource, resolve),
      entry.date ? formatDate(entry.date) : undefined,
      getCodeableConceptText(entry.flag),
      entry.deleted ? 'Removed' : undefined,
    ]).join(' · '))),
    field('Notes', notes(resource.note), true),
  ]))
}

function carePlanDetails(resource: CarePlan, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Intent', humanize(resource.intent)),
    field('Category', concepts(resource.category)),
    field('Description', resource.description, true),
    field('Period', period(resource.period)),
    field('Created date', resource.created ? formatDate(resource.created) : undefined),
    field('Author', reference(resource.author, resource, resolve)),
    field('Addresses', references(resource.addresses, resource, resolve)),
    field('Care team', references(resource.careTeam, resource, resolve)),
    field('Goals', references(resource.goal, resource, resolve)),
    field('Activities', resource.activity?.map((activity) => compact([
      reference(activity.reference, resource, resolve),
      getCodeableConceptText(activity.detail?.code),
      activity.detail?.description,
      humanize(activity.detail?.status),
    ]).join(' · '))),
    field('Supporting information', references(resource.supportingInfo, resource, resolve)),
    field('Notes', notes(resource.note), true),
  ]))
}

function goalDetails(resource: Goal, resolve?: ResolveResourceReference) {
  return model(group([
    field('Lifecycle status', humanize(resource.lifecycleStatus)),
    field('Achievement status', getCodeableConceptText(resource.achievementStatus)),
    field('Category', concepts(resource.category)),
    field('Priority', getCodeableConceptText(resource.priority)),
    field('Start', resource.startDate ? formatDate(resource.startDate) : getCodeableConceptText(resource.startCodeableConcept)),
    field('Targets', resource.target?.map((target) => compact([
      getCodeableConceptText(target.measure),
      quantity(target.detailQuantity) || range(target.detailRange) || getCodeableConceptText(target.detailCodeableConcept) || target.detailString,
      target.dueDate ? `Due ${formatDate(target.dueDate)}` : target.dueDuration ? `Due in ${quantity(target.dueDuration)}` : undefined,
    ]).join(' · '))),
    field('Status date', resource.statusDate ? formatDate(resource.statusDate) : undefined),
    field('Status reason', resource.statusReason),
    field('Expressed by', reference(resource.expressedBy, resource, resolve)),
    field('Addresses', references(resource.addresses, resource, resolve)),
    field('Outcomes', [...concepts(resource.outcomeCode), ...references(resource.outcomeReference, resource, resolve)]),
    field('Notes', notes(resource.note), true),
  ]))
}

function deviceDetails(resource: Device, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Status reason', concepts(resource.statusReason)),
    field('Names', resource.deviceName?.map((name) => `${name.name}${name.type ? ` (${humanize(name.type)})` : ''}`)),
    field('Manufacturer', resource.manufacturer),
    field('Model number', resource.modelNumber),
    field('Version', resource.version?.map((version) => compact([version.value, getCodeableConceptText(version.type)]).join(' · '))),
    field('UDI', resource.udiCarrier?.map((udi) => udi.carrierHRF || udi.deviceIdentifier || udi.jurisdiction)),
    field('Serial number', resource.serialNumber),
    field('Lot number', resource.lotNumber),
    field('Manufacture date', resource.manufactureDate ? formatDate(resource.manufactureDate) : undefined),
    field('Expiration date', resource.expirationDate ? formatDate(resource.expirationDate) : undefined),
    field('Owner', reference(resource.owner, resource, resolve)),
    field('Location', reference(resource.location, resource, resolve)),
    field('Safety', concepts(resource.safety)),
    field('Notes', notes(resource.note), true),
  ]))
}

function deviceRequestDetails(resource: DeviceRequest, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Intent', humanize(resource.intent)),
    field('Priority', humanize(resource.priority)),
    field('Device', getCodeableConceptText(resource.codeCodeableConcept) || reference(resource.codeReference, resource, resolve)),
    field('Authored date', resource.authoredOn ? formatDate(resource.authoredOn) : undefined),
    field('Occurrence', choice(resource.occurrenceDateTime, resource.occurrencePeriod)),
    field('Requester', reference(resource.requester, resource, resolve)),
    field('Performer', reference(resource.performer, resource, resolve)),
    field('Reason', [...concepts(resource.reasonCode), ...references(resource.reasonReference, resource, resolve)]),
    field('Supporting information', references(resource.supportingInfo, resource, resolve)),
    field('Parameters', resource.parameter?.map((parameter) => compact([
      getCodeableConceptText(parameter.code),
      getCodeableConceptText(parameter.valueCodeableConcept) || quantity(parameter.valueQuantity) || range(parameter.valueRange) ||
        (parameter.valueBoolean != null ? (parameter.valueBoolean ? 'Yes' : 'No') : ''),
    ]).join(': '))),
    field('Notes', notes(resource.note), true),
  ]))
}

function encounterDetails(resource: Encounter, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Class', resource.class.display || humanize(resource.class.code)),
    field('Type', concepts(resource.type)),
    field('Service type', getCodeableConceptText(resource.serviceType)),
    field('Priority', getCodeableConceptText(resource.priority)),
    field('Period', period(resource.period)),
    field('Length', quantity(resource.length)),
    field('Participants', resource.participant?.map((participant) => compact([
      ...concepts(participant.type),
      reference(participant.individual, resource, resolve),
      period(participant.period),
    ]).join(' · '))),
    field('Reasons', concepts(resource.reasonCode)),
    field('Diagnoses', resource.diagnosis?.map((diagnosis) => compact([
      reference(diagnosis.condition, resource, resolve),
      getCodeableConceptText(diagnosis.use),
      diagnosis.rank != null ? `Rank ${diagnosis.rank}` : undefined,
    ]).join(' · '))),
    field('Locations', resource.location?.map((location) => compact([
      reference(location.location, resource, resolve),
      humanize(location.status),
      period(location.period),
    ]).join(' · '))),
    field('Admit source', getCodeableConceptText(resource.hospitalization?.admitSource)),
    field('Discharge disposition', getCodeableConceptText(resource.hospitalization?.dischargeDisposition)),
  ]))
}

function questionnaireAnswer(answer: NonNullable<QuestionnaireResponseItem['answer']>[number], owner: Resource, resolve?: ResolveResourceReference) {
  return answer.valueString || (answer.valueBoolean != null ? String(answer.valueBoolean) : '') ||
    (answer.valueInteger != null ? String(answer.valueInteger) : '') ||
    (answer.valueDecimal != null ? String(answer.valueDecimal) : '') ||
    (answer.valueDate ? formatDate(answer.valueDate) : '') || (answer.valueDateTime ? formatDate(answer.valueDateTime) : '') ||
    answer.valueTime || quantity(answer.valueQuantity) || getCodeableConceptText(answer.valueCoding ? { coding: [answer.valueCoding] } : undefined) ||
    reference(answer.valueReference, owner, resolve) || answer.valueUri || ''
}

function questionnaireItems(items: QuestionnaireResponseItem[] | undefined, owner: Resource, resolve?: ResolveResourceReference, depth = 0): string[] {
  return items?.flatMap((item) => {
    const label = item.text || item.linkId
    const answers = compact(item.answer?.map((answer) => questionnaireAnswer(answer, owner, resolve)) ?? [])
    const line = answers.length ? `${'  '.repeat(depth)}${label}: ${answers.join('; ')}` : ''
    const nested = [
      ...questionnaireItems(item.item, owner, resolve, depth + 1),
      ...(item.answer?.flatMap((answer) => questionnaireItems(answer.item, owner, resolve, depth + 1)) ?? []),
    ]
    return compact([line, ...nested])
  }) ?? []
}

function questionnaireResponseDetails(resource: QuestionnaireResponse, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Questionnaire', resource.questionnaire),
    field('Authored date', resource.authored ? formatDate(resource.authored) : undefined),
    field('Author', reference(resource.author, resource, resolve)),
    field('Source', reference(resource.source, resource, resolve)),
    field('Responses', questionnaireItems(resource.item, resource, resolve), true),
  ]))
}

function documentReferenceDetails(resource: DocumentReference, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Document status', humanize(resource.docStatus)),
    field('Type', getCodeableConceptText(resource.type)),
    field('Category', concepts(resource.category)),
    field('Date', resource.date ? formatDate(resource.date) : undefined),
    field('Author', references(resource.author, resource, resolve)),
    field('Custodian', reference(resource.custodian, resource, resolve)),
    field('Description', resource.description, true),
    field('Encounter', references(resource.context?.encounter, resource, resolve)),
    field('Facility type', getCodeableConceptText(resource.context?.facilityType)),
    field('Practice setting', getCodeableConceptText(resource.context?.practiceSetting)),
    field('Attachments', resource.content.map(({ attachment }) => compact([
      attachment.title,
      attachment.contentType,
      attachment.creation ? formatDate(attachment.creation) : undefined,
      attachment.size != null ? `${attachment.size} bytes` : undefined,
    ]).join(' · '))),
  ]))
}

function compositionDetails(resource: Composition, resolve?: ResolveResourceReference) {
  return model(group([
    field('Status', humanize(resource.status)),
    field('Type', getCodeableConceptText(resource.type)),
    field('Category', concepts(resource.category)),
    field('Date', formatDate(resource.date)),
    field('Author', references(resource.author, resource, resolve)),
    field('Custodian', reference(resource.custodian, resource, resolve)),
    field('Encounter', reference(resource.encounter, resource, resolve)),
    field('Section titles', resource.section?.map((section) => section.title || getCodeableConceptText(section.code))),
  ]))
}

/** Returns clinically useful details for supported resource types, or null when no useful details exist. */
export function buildResourceDetailModel(
  resource: Resource,
  resolve?: ResolveResourceReference,
): ResourceDetailModel | null {
  switch (resource.resourceType) {
    case 'Condition': return conditionDetails(resource as Condition, resolve)
    case 'AllergyIntolerance': return allergyDetails(resource as AllergyIntolerance, resolve)
    case 'Observation': return observationDetails(resource as Observation, resolve)
    case 'DiagnosticReport': return diagnosticReportDetails(resource as DiagnosticReport, resolve)
    case 'Procedure': return procedureDetails(resource as Procedure, resolve)
    case 'ServiceRequest': return serviceRequestDetails(resource as ServiceRequest, resolve)
    case 'Immunization': return immunizationDetails(resource as Immunization, resolve)
    case 'Medication': return medicationDetails(resource as Medication, resolve)
    case 'MedicationRequest': return medicationRequestDetails(resource as MedicationRequest, resolve)
    case 'MedicationStatement': return medicationStatementDetails(resource as MedicationStatement, resolve)
    case 'List': return listDetails(resource as List, resolve)
    case 'CarePlan': return carePlanDetails(resource as CarePlan, resolve)
    case 'Goal': return goalDetails(resource as Goal, resolve)
    case 'Device': return deviceDetails(resource as Device, resolve)
    case 'DeviceRequest': return deviceRequestDetails(resource as DeviceRequest, resolve)
    case 'Encounter': return encounterDetails(resource as Encounter, resolve)
    case 'QuestionnaireResponse': return questionnaireResponseDetails(resource as QuestionnaireResponse, resolve)
    case 'DocumentReference': return documentReferenceDetails(resource as DocumentReference, resolve)
    case 'Composition': return compositionDetails(resource as Composition, resolve)
    default: return null
  }
}
