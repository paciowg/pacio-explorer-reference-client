/** Presents repeatable nutrition components and explicit allergy choices using small PFE demo terminology subsets. */
import type { NutritionChoice } from '../../igs/pacioPfe/nutritionTerminology'
import { NUTRITION_CHOICES } from '../../igs/pacioPfe/nutritionTerminology'
import type { NutritionReferenceOption } from './nutritionCreateData'
import { emptyQuantity, newAdministration, newSchedule, newSupplement, type NutritionForm, type QuantityValue, type ScheduleValue } from './nutritionFormModel'

type Props = { value: NutritionForm; options: NutritionReferenceOption[]; disabled: boolean; allergyLocked: boolean; onChange: (form: NutritionForm) => void }
type Option = { value: string; label: string }
const choices = (values: readonly string[]): Option[] => values.map((value) => ({ value, label: value.replaceAll('-', ' ') }))
const terminology = (values: NutritionChoice[]): Option[] => values.map((value) => ({ value: value.code, label: value.display }))

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="field-group"><label>{label}<input type={type} step={type === 'number' ? 'any' : undefined} value={value} onChange={(event) => onChange(event.target.value)} /></label></div>
}
function Select({ label, value, options, onChange, optional = true }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; optional?: boolean }) {
  return <div className="field-group"><label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{optional ? <option value="">None selected</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
}
function Multi({ label, values, options, onChange }: { label: string; values: string[]; options: Option[]; onChange: (values: string[]) => void }) {
  return <fieldset className="toc-section-card"><legend>{label}</legend><ul className="toc-option-list">{options.map((option) => <li key={option.value}><label><input type="checkbox" checked={values.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...values, option.value] : values.filter((value) => value !== option.value))} /><span>{option.label}</span></label></li>)}</ul>{!options.length ? <p className="empty-state">No choices available</p> : null}</fieldset>
}
function QuantityField({ label, value, units, onChange }: { label: string; value: QuantityValue; units: string[]; onChange: (value: QuantityValue) => void }) {
  return <div className="toc-metadata-grid"><Input label={label} type="number" value={value.value} onChange={(amount) => onChange({ ...value, value: amount })} /><Select label={`${label} unit`} value={value.unit} optional={false} options={choices(units)} onChange={(unit) => onChange({ ...value, unit })} /></div>
}
function Schedules({ values, onChange, single = false }: { values: ScheduleValue[]; onChange: (values: ScheduleValue[]) => void; single?: boolean }) {
  return <fieldset className="toc-section-card"><legend>Schedules</legend>{values.map((schedule, index) => {
    const update = (patch: Partial<ScheduleValue>) => onChange(values.map((old, position) => position === index ? { ...old, ...patch } : old))
    return <fieldset className="toc-section-card" key={index}><legend>Schedule {index + 1}</legend><div className="toc-metadata-grid">
      <Input label="Times per period" type="number" value={schedule.frequency} onChange={(frequency) => update({ frequency })} /><Input label="Period length" type="number" value={schedule.period} onChange={(period) => update({ period })} />
      <Select label="Period unit" value={schedule.unit} optional={false} options={choices(['h', 'd', 'wk', 'mo'])} onChange={(unit) => update({ unit: unit as ScheduleValue['unit'] })} />
      <Input label="Start date" type="date" value={schedule.start} onChange={(start) => update({ start })} /><Input label="End date" type="date" value={schedule.end} onChange={(end) => update({ end })} />
    </div><button type="button" className="secondary-button compact" onClick={() => onChange(values.filter((_, position) => position !== index))}>Remove schedule</button></fieldset>
  })}<button type="button" className="secondary-button compact" disabled={single && values.length > 0} onClick={() => onChange([...values, newSchedule()])}>Add schedule</button></fieldset>
}

export function NutritionOrderForm({ value: form, options, disabled, allergyLocked, onChange }: Props) {
  const set = <K extends keyof NutritionForm>(key: K, value: NutritionForm[K]) => onChange({ ...form, [key]: value })
  const references = (types: string[]) => options.filter((option) => types.includes(option.resource.resourceType)).map((option) => ({ value: option.reference, label: option.label }))
  const code = (label: string, value: string, group: keyof typeof NUTRITION_CHOICES, onChange: (value: string) => void) => <Select label={label} value={value} options={terminology(NUTRITION_CHOICES[group])} onChange={onChange} />
  const codes = (label: string, values: string[], group: keyof typeof NUTRITION_CHOICES, onChange: (values: string[]) => void) => <Multi label={label} values={values} options={terminology(NUTRITION_CHOICES[group])} onChange={onChange} />
  return <fieldset disabled={disabled} className="nutrition-form-fields">
    <fieldset className="toc-section-card"><legend>Order</legend><div className="toc-metadata-grid">
      <Select label="Status" value={form.status} optional={false} options={choices(['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown'])} onChange={(value) => set('status', value as NutritionForm['status'])} />
      <Select label="Intent" value={form.intent} optional={false} options={choices(['proposal', 'plan', 'directive', 'order', 'original-order', 'reflex-order', 'filler-order', 'instance-order', 'option'])} onChange={(value) => set('intent', value as NutritionForm['intent'])} />
      <Input label="Order date and time (UTC)" type="datetime-local" value={form.dateTime} onChange={(value) => set('dateTime', value)} />
      <Select label="Encounter" value={form.encounter} options={references(['Encounter'])} onChange={(value) => set('encounter', value)} />
      <Select label="Orderer" value={form.orderer} options={references(['Practitioner', 'PractitionerRole'])} onChange={(value) => set('orderer', value)} />
    </div></fieldset>
    <fieldset disabled={allergyLocked} className="toc-section-card"><legend>Allergies and intolerances (required)</legend>
      <label><input type="radio" name="nutrition-allergy-mode" checked={form.allergyMode === 'existing'} onChange={() => set('allergyMode', 'existing')} /> Select existing allergy records</label>
      <label><input type="radio" name="nutrition-allergy-mode" checked={form.allergyMode === 'none-known'} onChange={() => set('allergyMode', 'none-known')} /> No known food allergies</label>
      {form.allergyMode === 'existing' ? <Multi label="Destination patient allergy records" values={form.allergies} options={references(['AllergyIntolerance'])} onChange={(value) => set('allergies', value)} /> : null}
      {form.allergyMode === 'none-known' ? <p className="helper-text">An existing no-known-food-allergy record will be reused, or a new record created for the destination patient.</p> : null}
      {allergyLocked ? <p className="helper-text">Patient and allergy references are preserved for retry.</p> : null}
    </fieldset>
    <details><summary>Food preferences and exclusions</summary><div className="toc-metadata-grid">{codes('Food preferences', form.preferences, 'preference', (value) => set('preferences', value))}{codes('Excluded foods', form.excludedFoods, 'food', (value) => set('excludedFoods', value))}</div></details>
    <fieldset className="toc-section-card"><legend>Oral diet</legend><label><input type="checkbox" checked={form.oralEnabled} onChange={(event) => set('oralEnabled', event.target.checked)} /> Include oral diet</label>
      {form.oralEnabled ? <div className="nutrition-form-fields">{codes('Diet types', form.oralTypes, 'diet', (value) => set('oralTypes', value))}
        <fieldset className="toc-section-card"><legend>Nutrient modifications</legend>{form.nutrients.map((nutrient, index) => {
          const update = (patch: Partial<typeof nutrient>) => set('nutrients', form.nutrients.map((old, position) => position === index ? { ...old, ...patch } : old))
          return <fieldset className="toc-section-card" key={index}><legend>Nutrient {index + 1}</legend>{code('Nutrient modifier', nutrient.modifier, 'nutrient', (modifier) => update({ modifier }))}<QuantityField label="Nutrient amount" value={nutrient.amount} units={['mg', 'g', 'mL']} onChange={(amount) => update({ amount })} /><button type="button" className="secondary-button compact" onClick={() => set('nutrients', form.nutrients.filter((_, position) => position !== index))}>Remove nutrient</button></fieldset>
        })}<button type="button" className="secondary-button compact" onClick={() => set('nutrients', [...form.nutrients, { modifier: '', amount: emptyQuantity('mg') }])}>Add nutrient</button></fieldset>
        <fieldset className="toc-section-card"><legend>Textures</legend>{form.textures.map((texture, index) => {
          const update = (patch: Partial<typeof texture>) => set('textures', form.textures.map((old, position) => position === index ? { ...old, ...patch } : old))
          return <fieldset className="toc-section-card" key={index}><legend>Texture {index + 1}</legend>{code('Texture modifier', texture.modifier, 'texture', (modifier) => update({ modifier }))}{code('Texture food type', texture.food, 'food', (food) => update({ food }))}<button type="button" className="secondary-button compact" onClick={() => set('textures', form.textures.filter((_, position) => position !== index))}>Remove texture</button></fieldset>
        })}<button type="button" className="secondary-button compact" onClick={() => set('textures', [...form.textures, { modifier: '', food: '' }])}>Add texture</button></fieldset>
        {codes('Fluid consistency', form.fluids, 'fluid', (value) => set('fluids', value))}<Input label="Oral diet instructions" value={form.oralInstruction} onChange={(value) => set('oralInstruction', value)} />
      </div> : null}
    </fieldset>
    <fieldset className="toc-section-card"><legend>Supplements</legend><label><input type="checkbox" checked={form.supplementsEnabled} onChange={(event) => set('supplementsEnabled', event.target.checked)} /> Include supplements</label>
      {form.supplementsEnabled ? <div className="nutrition-form-fields">{form.supplements.map((supplement, index) => {
        const update = (patch: Partial<typeof supplement>) => set('supplements', form.supplements.map((old, position) => position === index ? { ...old, ...patch } : old))
        return <fieldset className="toc-section-card" key={index}><legend>Supplement {index + 1}</legend>{code('Supplement type', supplement.type, 'supplement', (type) => update({ type }))}<Schedules values={supplement.schedules} onChange={(schedules) => update({ schedules })} /><QuantityField label="Supplement quantity" value={supplement.quantity} units={['mL', 'g']} onChange={(quantity) => update({ quantity })} /><Input label="Supplement instructions" value={supplement.instruction} onChange={(instruction) => update({ instruction })} /><button type="button" className="secondary-button compact" onClick={() => set('supplements', form.supplements.filter((_, position) => position !== index))}>Remove supplement</button></fieldset>
      })}<button type="button" className="secondary-button compact" onClick={() => set('supplements', [...form.supplements, newSupplement()])}>Add supplement</button></div> : null}
    </fieldset>
    <fieldset className="toc-section-card"><legend>Enteral formula</legend><label><input type="checkbox" checked={form.enteralEnabled} onChange={(event) => set('enteralEnabled', event.target.checked)} /> Include enteral formula</label>
      {form.enteralEnabled ? <div className="nutrition-form-fields">{code('Base formula type', form.formula, 'formula', (value) => set('formula', value))}{code('Additive type', form.additive, 'additive', (value) => set('additive', value))}
        <QuantityField label="Caloric density" value={form.caloricDensity} units={['kcal/mL']} onChange={(value) => set('caloricDensity', value)} />{code('Administration route', form.route, 'route', (value) => set('route', value))}
        {form.administrations.map((administration, index) => {
          const update = (patch: Partial<typeof administration>) => set('administrations', form.administrations.map((old, position) => position === index ? { ...old, ...patch } : old))
          return <fieldset className="toc-section-card" key={index}><legend>Administration {index + 1}</legend><Schedules single values={administration.schedules} onChange={(schedules) => update({ schedules })} />
            <QuantityField label="Administration quantity" value={administration.quantity} units={['mL']} onChange={(quantity) => update({ quantity })} />
            <Select label="Rate representation" value={administration.rateType} options={[{ value: 'quantity', label: 'Quantity (mL/hour)' }, { value: 'ratio', label: 'Ratio (volume over time)' }]} onChange={(rateType) => update({ rateType: rateType as typeof administration.rateType, rate: emptyQuantity(rateType === 'ratio' ? 'mL' : 'mL/h') })} />
            {administration.rateType ? <QuantityField label="Rate amount" value={administration.rate} units={administration.rateType === 'ratio' ? ['mL'] : ['mL/h']} onChange={(rate) => update({ rate })} /> : null}
            {administration.rateType === 'ratio' ? <QuantityField label="Rate denominator" value={administration.denominator} units={['h', 'd']} onChange={(denominator) => update({ denominator })} /> : null}
            <button type="button" className="secondary-button compact" onClick={() => set('administrations', form.administrations.filter((_, position) => position !== index))}>Remove administration</button>
          </fieldset>
        })}<button type="button" className="secondary-button compact" onClick={() => set('administrations', [...form.administrations, newAdministration()])}>Add administration</button>
        <Input label="Enteral administration instructions" value={form.enteralInstruction} onChange={(value) => set('enteralInstruction', value)} />
      </div> : null}
    </fieldset>
  </fieldset>
}
