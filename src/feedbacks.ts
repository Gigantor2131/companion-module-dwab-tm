import { combineRgb } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { defaultDisplay, displayChoices } from './audianceDisplay.js'
import { FieldsetAudienceDisplay } from 'vex-tm-client'

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		audience_display: {
			name: 'Audience Display is...',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'display',
					type: 'dropdown',
					label: 'Display Status',
					choices: displayChoices,
					allowCustom: false,
					default: defaultDisplay.toString(),
				},
			],
			callback: (feedback) => {
				const target = feedback.options.display as FieldsetAudienceDisplay
				const current = self.fieldset?.state.audienceDisplay

				self.log('debug', `audience_display feedback: current=${current} target=${target}`)

				if (current == undefined) {
					return false
				}
				return current.toString() === target.toString()
			},
		},
		active_field: {
			name: 'Active Field is...',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'field',
					type: 'dropdown',
					label: 'Field',
					choices: self.fields?.map((f) => ({ id: f.id.toString(), label: f.name })) ?? [],
					allowCustom: false,
					default: self.fields[0]?.id,
				},
			],
			callback: (feedback) => {
				const target = feedback.options.field as string
				const current = self.getVariableValue('field_id') as number | undefined

				self.log('debug', `active_field feedback: current=${current} target=${target}`)

				if (current == undefined) {
					return false
				}
				return current.toString() === target.toString()
			},
		},
	})
}
