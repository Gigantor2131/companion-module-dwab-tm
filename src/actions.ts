import { FieldsetAudienceDisplay, FieldsetQueueSkillsType } from 'vex-tm-client'
import type { ModuleInstance } from './main.js'
import { defaultDisplay, displayChoices } from './audianceDisplay.js'

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		queue_next_match: {
			name: 'Queue Next Match',
			options: [],
			callback: async () => {
				await self.fieldset?.queueNextMatch()
			},
		},
		queue_previous_match: {
			name: 'Queue Previous Match',
			options: [],
			callback: async () => {
				await self.fieldset?.queuePreviousMatch()
			},
		},
		queue_skills_programming: {
			name: 'Queue Skills Match',
			options: [],
			callback: async () => {
				await self.fieldset?.queueSkills(FieldsetQueueSkillsType.Programming)
			},
		},
		queue_skills_driver: {
			name: 'Queue Skills Match',
			options: [],
			callback: async () => {
				await self.fieldset?.queueSkills(FieldsetQueueSkillsType.Driver)
			},
		},
		start_match: {
			name: 'Start Match',
			options: [],
			callback: async () => {
				await self.fieldset?.startMatch(1)
			},
		},
		end_match_early: {
			name: 'End Match Early',
			options: [],
			callback: async () => {
				await self.fieldset?.endMatchEarly(1)
			},
		},
		reset_timer: {
			name: 'Reset Timer',
			options: [],
			callback: async () => {
				await self.fieldset?.resetTimer(1)
			},
		},
		abort_match: {
			name: 'Abort Match',
			options: [],
			callback: async () => {
				await self.fieldset?.abortMatch(1)
			},
		},
		set_audience_display: {
			name: 'Set Audience Display',
			options: [
				{
					id: 'display',
					type: 'dropdown',
					label: 'Display Screen',
					choices: displayChoices,
					allowCustom: false,
					default: defaultDisplay.toString(),
				},
			],
			callback: async (action) => {
				const display: FieldsetAudienceDisplay = action.options.display as FieldsetAudienceDisplay
				await self.fieldset?.setAudienceDisplay(display)
			},
		},
	})
}
