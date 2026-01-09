import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	ip: string
	fieldset_name: string
	client_id: string
	client_expiration: string
}
export interface ModuleSecretConfig {
	api_key: string
	client_secret: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'ip',
			label: 'IP Address',
			width: 8,
			regex: Regex.IP,
			default: '127.0.0.1',
		},
		{
			type: 'textinput',
			id: 'fieldset_name',
			label: 'Fieldset Name',
			width: 8,
			default: 'Match Field Set #1',
		},
		{
			type: 'secret-text',
			id: 'api_key',
			label: 'TM API Key',
			width: 8,
		},
		{
			type: 'textinput',
			id: 'client_id',
			label: 'Client ID',
			width: 8,
		},
		{
			type: 'secret-text',
			id: 'client_secret',
			label: 'Client Secret',
			width: 8,
		},
		{
			type: 'textinput',
			id: 'client_expiration',
			label: 'Client Expiration',
			width: 8,
			default: '2026-06-09T00:00:00+0000',
		},
	]
}
