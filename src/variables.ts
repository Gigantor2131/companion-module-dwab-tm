import type { ModuleInstance } from './main.js'

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions([
		{ variableId: 'match', name: 'Match' },
		{ variableId: 'last_active_field', name: 'Last Active Field' },
	])
}
