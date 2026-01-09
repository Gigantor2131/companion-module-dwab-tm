import { FieldsetAudienceDisplay } from 'vex-tm-client'

export const displayChoices = [
	{ id: FieldsetAudienceDisplay.Blank.toString(), label: 'None' },
	{ id: FieldsetAudienceDisplay.Logo.toString(), label: 'Logo' },
	{ id: FieldsetAudienceDisplay.Intro.toString(), label: 'Up Next' },
	{ id: FieldsetAudienceDisplay.InMatch.toString(), label: 'In-Match' },
	{ id: FieldsetAudienceDisplay.SavedMatchResults.toString(), label: 'Saved Match Results' },
	{ id: FieldsetAudienceDisplay.Schedule.toString(), label: 'Schedule' },
	{ id: FieldsetAudienceDisplay.Rankings.toString(), label: 'Rankings' },
	{ id: FieldsetAudienceDisplay.SkillsRankings.toString(), label: 'Skills Rankings' },
	{ id: FieldsetAudienceDisplay.AllianceSelection.toString(), label: 'Alliance Selection' },
	{ id: FieldsetAudienceDisplay.ElimBracket.toString(), label: 'Elim Bracket' },
	{ id: FieldsetAudienceDisplay.Slides.toString(), label: 'Award Slides' },
	{ id: FieldsetAudienceDisplay.Inspection.toString(), label: 'Inspection' },
]
export const defaultDisplay = FieldsetAudienceDisplay.Blank
