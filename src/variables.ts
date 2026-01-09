import { FieldsetAudienceDisplay } from 'vex-tm-client'
import type { ModuleInstance } from './main.js'
export interface VariableState {
	match: string
	field_id: number | undefined
	field_seq: number | undefined
	field_name: string | undefined
	match_is_running: boolean | undefined
	audience_display: FieldsetAudienceDisplay | undefined
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions([
		{ variableId: 'match', name: 'Match Name' },
		{ variableId: 'field_id', name: 'Field Id' },
		{ variableId: 'field_seq', name: 'Field Seq' },
		{ variableId: 'field_name', name: 'Field Name' },
		{ variableId: 'match_is_running', name: 'Match is Running' },
		{ variableId: 'audience_display', name: 'Audience Display' },
	])
}
