/** Checks collection patient boundaries and reports unresolved snapshot references without performing live reads. */
import type { Bundle, List, MedicationStatement, Patient, Resource } from 'fhir/r4'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { walkReferences } from './smpReferences'

export function snapshotResolver(bundle: Bundle) {
  const index = createBundleIndex(bundle)
  const byFullUrl = new Map((bundle.entry || []).flatMap((e) => e.fullUrl && e.resource ? [[e.fullUrl, e.resource] as const] : []))
  // An exact fullUrl match is safe inside a snapshot, even when it names the original source server.
  return (ref: string | undefined, owner?: Resource) => ref === '#' ? owner : ref ? byFullUrl.get(ref) || index.resolve(ref, owner) : undefined
}

export function validateSnapshotPatient(bundle: Bundle, destinationPatient?: Patient) {
  if (bundle.type !== 'collection' || bundle.entry?.[0]?.resource?.resourceType !== 'List') throw new Error('This attachment is not a supported SMP collection.')
  const resolve = snapshotResolver(bundle)
  const patients = bundle.entry.flatMap((e) => e.resource?.resourceType === 'Patient' ? [e.resource] : [])
  if (patients.length !== 1) throw new Error('The snapshot must identify exactly one embedded Patient.')
  const captured = patients[0] as Patient
  if (destinationPatient) {
    const identifiersMatch = captured.identifier?.some((a) => a.system && a.value && destinationPatient.identifier?.some((b) => a.system === b.system && a.value === b.value))
    const namesMatch = captured.name?.some((a) => destinationPatient.name?.some((b) =>
      (a.family && b.family && a.family.toLocaleLowerCase() === b.family.toLocaleLowerCase() && a.given?.[0]?.toLocaleLowerCase() === b.given?.[0]?.toLocaleLowerCase()) || (a.text && a.text === b.text)))
    if (!identifiersMatch && captured.name?.length && destinationPatient.name?.length && (!namesMatch || (captured.birthDate && destinationPatient.birthDate && captured.birthDate !== destinationPatient.birthDate))) throw new Error('Captured patient demographics do not match the indexed patient.')
  }
  for (const { resource } of bundle.entry) {
    if (resource?.resourceType === 'List' || resource?.resourceType === 'MedicationStatement') {
      if (resolve((resource as List | MedicationStatement).subject?.reference, resource) !== patients[0]) throw new Error('Snapshot contains mismatched patient references.')
    }
    if (resource?.resourceType === 'List') {
      for (const entry of (resource as List).entry || []) {
        const member = resolve(entry.item.reference, resource) as MedicationStatement | undefined
        if (member?.resourceType === 'MedicationStatement' && resolve(member.subject?.reference, member) !== patients[0]) throw new Error('Snapshot contains mismatched patient references.')
      }
    }
  }
}

export function unresolvedSnapshotReferences(bundle: Bundle) {
  const resolve = snapshotResolver(bundle)
  const missing = new Set<string>()
  for (const { resource } of bundle.entry || []) {
    if (resource) walkReferences(resource, (node, owner) => {
      if (typeof node.reference !== 'string' || !resolve(node.reference, owner)) missing.add(typeof node.reference === 'string' ? node.reference : 'Identifier-only reference')
    })
  }
  return [...missing]
}
