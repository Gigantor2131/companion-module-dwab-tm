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

		ChannelState: {
			name: 'Example Feedback',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Test',
					default: 5,
					min: 0,
					max: 10,
				},
			],
			callback: (feedback) => {
				console.log('Hello world!', feedback.options.num)
				if (Number(feedback.options.num) > 5) {
					return true
				} else {
					return false
				}
			},
		},
	})
}
