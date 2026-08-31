/** Selects a small, readable clinical summary from resources returned by Patient/$everything. */
import type {
  AllergyIntolerance,
  Bundle,
  Coding,
  Condition,
  DocumentReference,
  MedicationStatement,
  Observation,
  Quantity,
  Resource,
} from 'fhir/r4'
import type { ClinicalListItem, SelectableClinicalListItem } from '../../components/clinicalTypes'
import {
  formatDate,
  getCodeableConceptText,
  placeholderValue,
} from '../../lib/fhir/formatters'
import { getSimpleResourceDisplay } from '../../lib/fhir/resourceDisplay'
import { getTocDocuments } from '../transitionsOfCare/tocModel'

// This reference client intentionally recognizes a small explicit LOINC subset rather than
// attempting terminology expansion in the browser.
const BLOOD_PRESSURE_PANEL_CODES = new Set(['85354-9'])
const SYSTOLIC_BP_CODES = new Set(['8480-6'])
const DIASTOLIC_BP_CODES = new Set(['8462-4'])
const HEART_RATE_CODES = new Set(['8867-4'])
const RESPIRATORY_RATE_CODES = new Set(['9279-1'])
const BODY_TEMPERATURE_CODES = new Set(['8310-5'])
const OXYGEN_SATURATION_CODES = new Set(['2708-6', '59408-5'])
const ADVANCE_DIRECTIVE_CATEGORY_CODES = new Set(['42348-3'])
const ADVANCE_DIRECTIVE_DESCRIPTION_MAX_LENGTH = 120
const CLINICAL_LIST_LIMIT = 10

export type ClinicalSummary = {
  activeProblems: ClinicalListItem[]
  currentMedications: ClinicalListItem[]
  knownAllergies: ClinicalListItem[]
  mostRecentVitals: ClinicalListItem[]
  advanceDirectives: SelectableClinicalListItem[]
  transitionOfCares: SelectableClinicalListItem[]
}

export function buildClinicalSummary(bundle: Bundle | null): ClinicalSummary {
  return {
    activeProblems: getActiveProblems(bundle),
    currentMedications: getCurrentMedications(bundle),
    knownAllergies: getKnownAllergies(bundle),
    mostRecentVitals: getMostRecentVitals(bundle),
    advanceDirectives: getAdvanceDirectives(bundle),
    transitionOfCares: getTocDocuments(bundle),
  }
}

function getBundleResources<T extends Resource>(
  bundle: Bundle | null,
  resourceType: string,
): T[] {
  return (
    bundle?.entry
      ?.map((entry) => entry.resource)
      .filter((resource): resource is T => resource?.resourceType === resourceType) ?? []
  )
}

function getActiveProblems(bundle: Bundle | null): ClinicalListItem[] {
  return getBundleResources<Condition>(bundle, 'Condition')
    .filter((condition) => {
      const status = condition.clinicalStatus?.coding?.[0]?.code
      // Missing status is retained so incomplete example data remains visible.
      return !status || ['active', 'recurrence', 'relapse'].includes(status)
    })
    .sort((a, b) =>
      sortByDateDesc(
        a.onsetDateTime || a.recordedDate,
        b.onsetDateTime || b.recordedDate,
      ),
    )
    .map((condition) => {
      const rawDateValue = condition.onsetDateTime || condition.recordedDate

      return {
        title: getSimpleResourceDisplay(condition),
        dateLabel: condition.onsetDateTime ? 'Onset' : condition.recordedDate ? 'Recorded' : undefined,
        dateValue: rawDateValue ? formatDate(rawDateValue) : undefined,
      }
    })
    .slice(0, CLINICAL_LIST_LIMIT)
}

function getCurrentMedications(bundle: Bundle | null): ClinicalListItem[] {
  return getBundleResources<MedicationStatement>(bundle, 'MedicationStatement')
    .filter((statement) => {
      const status = statement.status
      return !status || ['active', 'completed', 'intended', 'on-hold'].includes(status)
    })
    .sort((a, b) =>
      sortByDateDesc(
        a.dateAsserted || a.effectiveDateTime || a.effectivePeriod?.start,
        b.dateAsserted || b.effectiveDateTime || b.effectivePeriod?.start,
      ),
    )
    .map((statement) => {
      const rawDateValue =
        statement.dateAsserted ||
        statement.effectiveDateTime ||
        statement.effectivePeriod?.start

      return {
        title: getSimpleResourceDisplay(statement),
        dateLabel: rawDateValue ? 'Recorded' : undefined,
        dateValue: rawDateValue ? formatDate(rawDateValue) : undefined,
      }
    })
    .slice(0, CLINICAL_LIST_LIMIT)
}

function getKnownAllergies(bundle: Bundle | null): ClinicalListItem[] {
  return getBundleResources<AllergyIntolerance>(bundle, 'AllergyIntolerance')
    .filter((allergy) => allergy.verificationStatus?.coding?.[0]?.code !== 'entered-in-error')
    .sort((a, b) =>
      sortByDateDesc(
        a.lastOccurrence || a.recordedDate,
        b.lastOccurrence || b.recordedDate,
      ),
    )
    .map((allergy) => {
      const hasLastOccurrence = Boolean(allergy.lastOccurrence)
      const rawDateValue = allergy.lastOccurrence || allergy.recordedDate

      return {
        title: getSimpleResourceDisplay(allergy),
        dateLabel: rawDateValue
          ? hasLastOccurrence
            ? 'Last occurrence'
            : 'Recorded'
          : undefined,
        dateValue: rawDateValue ? formatDate(rawDateValue) : undefined,
        secondaryText:
          allergy.type === 'allergy'
            ? `${capitalize(allergy.category?.[0] || 'Allergy')} allergy`
            : allergy.type
              ? capitalize(allergy.type)
              : undefined,
      }
    })
    .slice(0, CLINICAL_LIST_LIMIT)
}

function getMostRecentVitals(bundle: Bundle | null): ClinicalListItem[] {
  const observations = getBundleResources<Observation>(bundle, 'Observation').filter(
    (observation) => {
      const status = observation.status
      return !status || ['final', 'amended'].includes(status)
    },
  )

  // Select one latest usable Observation per supported vital, not simply the latest panel.
  const latestBloodPressure = getLatestBloodPressure(observations)
  const latestHeartRate = getLatestQuantityObservation(observations, HEART_RATE_CODES)
  const latestRespiratoryRate = getLatestQuantityObservation(
    observations,
    RESPIRATORY_RATE_CODES,
  )
  const latestTemperature = getLatestQuantityObservation(
    observations,
    BODY_TEMPERATURE_CODES,
  )
  const latestOxygenSaturation = getLatestQuantityObservation(
    observations,
    OXYGEN_SATURATION_CODES,
  )

  return [
    latestBloodPressure,
    latestHeartRate
      ? quantityObservationToItem('Heart rate', latestHeartRate)
      : null,
    latestRespiratoryRate
      ? quantityObservationToItem('Respiratory rate', latestRespiratoryRate)
      : null,
    latestTemperature
      ? quantityObservationToItem('Body temperature', latestTemperature)
      : null,
    latestOxygenSaturation
      ? quantityObservationToItem('Oxygen saturation', latestOxygenSaturation)
      : null,
  ].filter((item): item is ClinicalListItem => Boolean(item))
}

function getAdvanceDirectives(bundle: Bundle | null): SelectableClinicalListItem[] {
  return getBundleResources<DocumentReference>(bundle, 'DocumentReference')
    .filter((documentReference) =>
      Boolean(documentReference.id) &&
      documentReference.category?.some((category) =>
        hasCoding(category.coding, ADVANCE_DIRECTIVE_CATEGORY_CODES),
      ),
    )
    .sort((a, b) => sortByDateDesc(a.date, b.date))
    .map((documentReference) => ({
      id: documentReference.id!,
      title: getCodeableConceptText(documentReference.type) || placeholderValue(),
      dateLabel: documentReference.date ? 'Date' : undefined,
      dateValue: documentReference.date ? formatDate(documentReference.date) : undefined,
      secondaryText: truncateText(
        documentReference.description,
        ADVANCE_DIRECTIVE_DESCRIPTION_MAX_LENGTH,
      ),
    }))
    .slice(0, CLINICAL_LIST_LIMIT)
}

function getLatestBloodPressure(observations: Observation[]): ClinicalListItem | null {
  const candidates = observations
    .filter((observation) => hasCoding(observation.code?.coding, BLOOD_PRESSURE_PANEL_CODES))
    .sort(sortByObservationDateDesc)

  for (const observation of candidates) {
    const systolic = observation.component?.find((component) =>
      hasCoding(component.code?.coding, SYSTOLIC_BP_CODES),
    )?.valueQuantity
    const diastolic = observation.component?.find((component) =>
      hasCoding(component.code?.coding, DIASTOLIC_BP_CODES),
    )?.valueQuantity

    if (systolic?.value != null && diastolic?.value != null) {
      return {
        title: 'Blood pressure',
        secondaryText: `${systolic.value}/${diastolic.value} ${systolic.unit || 'mmHg'}`,
        dateLabel: 'Observed',
        dateValue: formatDate(getObservationDate(observation)),
      }
    }
  }

  return null
}

function getLatestQuantityObservation(
  observations: Observation[],
  codes: Set<string>,
) {
  return observations
    .filter((observation) => hasCoding(observation.code?.coding, codes))
    .filter((observation) => observation.valueQuantity?.value != null)
    .sort(sortByObservationDateDesc)[0]
}

function quantityObservationToItem(
  title: string,
  observation: Observation,
): ClinicalListItem {
  return {
    title,
    secondaryText: formatQuantity(observation.valueQuantity),
    dateLabel: 'Observed',
    dateValue: formatDate(getObservationDate(observation)),
  }
}

function formatQuantity(quantity: Quantity | undefined) {
  if (quantity?.value == null) return placeholderValue()
  return `${quantity.value} ${quantity.unit || ''}`.trim()
}

function truncateText(value: string | undefined, maxLength: number) {
  if (!value) return undefined

  const normalized = value.trim()
  if (normalized.length <= maxLength) return normalized

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function hasCoding(coding: Coding[] | undefined, codes: Set<string>) {
  return coding?.some((item) => Boolean(item.code && codes.has(item.code))) ?? false
}

function getObservationDate(observation: Observation) {
  return (
    observation.effectiveDateTime ||
    observation.issued ||
    observation.meta?.lastUpdated ||
    undefined
  )
}

function sortByObservationDateDesc(a: Observation, b: Observation) {
  const aDate = Date.parse(getObservationDate(a) || '')
  const bDate = Date.parse(getObservationDate(b) || '')
  return bDate - aDate
}

function sortByDateDesc(a: string | undefined, b: string | undefined) {
  const aDate = Date.parse(a || '')
  const bDate = Date.parse(b || '')
  return bDate - aDate
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
