/** Presents typed nutrition order disclosures and the creation action within the patient summary. */
import type { ClinicalListItem } from '../../components/clinicalTypes'
import { ExpandableFhirResource } from '../../components/FhirResourceDetails'
import { navigateTo } from '../../lib/routing/routes'

export function NutritionOrdersSection({ items, patientId, emptyMessage }: { items: ClinicalListItem[]; patientId: string; emptyMessage: string }) {
  return <section className="summary-card clinical-summary-card"><h3>Nutrition Orders</h3>
    {items.length ? <ul className="clinical-list">{items.map((item, index) => <ExpandableFhirResource key={item.resource?.id || index} resource={item.resource!} title={item.title} secondaryText={item.secondaryText} dateLabel={item.dateLabel} dateValue={item.dateValue} details={item.details || null} />)}</ul> : <p className="empty-state">{emptyMessage}</p>}
    <div className="clinical-section-footer"><button type="button" className="secondary-button outline compact" onClick={() => navigateTo(`/patients/${patientId}/nutrition-orders/new`)}>Create Nutrition Order</button></div>
  </section>
}
