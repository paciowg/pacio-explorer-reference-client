/** Presents the shared patient form heading and back action; pages own navigation and form state. */
import type { Patient } from 'fhir/r4'
import { getDisplayNameFromHumanName } from '../lib/fhir/formatters'
import { PanelServerDetails } from './PanelServerDetails'

type PatientFormHeaderProps = {
  title: string
  patient?: Patient | null
  serverLabel: string
  serverBaseUrl: string
  onBack: () => void
  backDisabled?: boolean
}

export function PatientFormHeader({ title, patient, serverLabel, serverBaseUrl, onBack, backDisabled }: PatientFormHeaderProps) {
  return <>
    <div className="panel-header"><div>
      <h2>{title}</h2>
      {patient ? <p className="create-patient-name">{getDisplayNameFromHumanName(patient.name?.[0])}</p> : null}
    </div><PanelServerDetails label={serverLabel} baseUrl={serverBaseUrl} /></div>
    <div className="page-actions page-actions-spaced">
      <button type="button" className="secondary-button outline" disabled={backDisabled} onClick={onBack}>Back to patient</button>
    </div>
  </>
}
