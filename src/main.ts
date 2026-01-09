import {
	InstanceBase,
	runEntrypoint,
	InstanceStatus,
	SomeCompanionConfigField,
	CompanionVariableValues,
} from '@companion-module/base'
import { GetConfigFields, ModuleSecretConfig, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, VariableState } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import {
	Client,
	Fieldset,
	FieldsetActiveMatchType,
	FieldsetMatch,
	FieldsetState,
	MatchRound,
	type ClientArgs,
	type Field,
	FieldsetQueueState,
	FieldsetAudienceDisplay,
} from 'vex-tm-client'

export class ModuleInstance extends InstanceBase<ModuleConfig, ModuleSecretConfig> {
	config!: ModuleConfig // Setup in init()
	secrets!: ModuleSecretConfig // Setup in init()
	fieldset?: Fieldset
	fields!: Field[]
	reconnectInterval?: NodeJS.Timeout = undefined
	lastVariableState?: VariableState = undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async connect(): Promise<ConnectResult> {
		// verify user config
		if (
			this.config.client_id === undefined ||
			this.secrets.client_secret === undefined ||
			this.config.client_expiration === undefined
		) {
			this.updateStatus(InstanceStatus.BadConfig, 'tm api credentials not provided')
			return { success: false, error_msg: 'tm api credentials not provided' }
		}

		if (this.config.ip === undefined || this.secrets.api_key === undefined) {
			this.updateStatus(InstanceStatus.BadConfig, 'tm connection info not provided')
			return { success: false, error_msg: 'tm connection info not provided' }
		}

		if (this.config.fieldset_name === undefined) {
			this.updateStatus(InstanceStatus.BadConfig, 'fieldset connection info not provided')
			return { success: false, error_msg: 'fieldset connection info not provided' }
		}

		const clientArgs: ClientArgs = {
			address: `http://${this.config.ip}`,
			authorization: {
				client_id: this.config.client_id,
				client_secret: this.secrets.client_secret,
				grant_type: 'client_credentials',
				expiration_date: new Date(this.config.client_expiration).valueOf(),
			},
			clientAPIKey: this.secrets.api_key,
		}
		const fieldsetRes = await getFieldset(clientArgs, this.config.fieldset_name)
		if (fieldsetRes.success === false) {
			this.updateStatus(InstanceStatus.ConnectionFailure, fieldsetRes.error_msg)
			return { success: false, error_msg: fieldsetRes.error_msg, error_result: fieldsetRes }
		}
		this.fieldset = fieldsetRes.fieldset

		const fieldsRes = await getFieldsetFields(this.fieldset)
		if (fieldsRes.success === false) {
			this.updateStatus(InstanceStatus.ConnectionFailure, fieldsRes.error_msg)
			return { success: false, error_msg: fieldsRes.error_msg, error_result: fieldsRes }
		}
		this.fields = fieldsRes.fields

		const fieldsetConnectionRes = await this.connectToFieldset(this.fieldset)
		if (fieldsetConnectionRes.success === false) {
			this.updateStatus(InstanceStatus.ConnectionFailure, fieldsetConnectionRes.error_msg)
			return {
				success: false,
				error_msg: fieldsetConnectionRes.error_msg,
				error_result: fieldsetConnectionRes,
			}
		}

		//initialize variables
		this.lastVariableState = VexTmClientMatchStateToVariableStateMapper(this.fieldset.state, this.fields)

		this.updateStatus(InstanceStatus.Ok)
		return { success: true }
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecretConfig): Promise<void> {
		this.config = config
		this.secrets = secrets
		this.log('debug', `init ${JSON.stringify({ config: this.config, secrets: this.secrets })}`)

		const connectRes = await this.connect() // connect to TM and Fieldset
		if (connectRes.success === false) {
			return
		}

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
		await this.fieldset?.disconnect()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecretConfig): Promise<void> {
		this.updateStatus(InstanceStatus.Disconnected, 'config updated')
		await this.fieldset?.disconnect()
		this.fieldset = undefined

		this.config = config
		this.secrets = secrets

		await this.connect()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	getCurrentVariableState(): VariableState {
		return {
			audience_display: this.getVariableValue('audience_display') as FieldsetAudienceDisplay | undefined,
			field_id: this.getVariableValue('field_id') as number | undefined,
			field_seq: this.getVariableValue('field_seq') as number | undefined,
			field_name: this.getVariableValue('field_name') as string | undefined,
			match: (this.getVariableValue('match') as string | undefined) ?? 'UNKNOWN',
			match_is_running: this.getVariableValue('match_is_running') as boolean | undefined,
		}
	}

	onFieldsetMessage(fieldset: Fieldset): void {
		const newState = VexTmClientMatchStateToVariableStateMapper(fieldset.state, this.fields)
		const currentState = this.getCurrentVariableState()

		// check what state has changed
		const variablesToUpdate: CompanionVariableValues = {}
		const feedbacksToUpdate: string[] = []
		if (newState.audience_display !== currentState.audience_display) {
			variablesToUpdate['audience_display'] = newState.audience_display
			feedbacksToUpdate.push('audience_display')
		}
		if (newState.field_id !== currentState.field_id) {
			variablesToUpdate['field_id'] = newState.field_id
		}
		if (newState.field_seq !== currentState.field_seq) {
			variablesToUpdate['field_seq'] = newState.field_seq
		}
		if (newState.field_name !== currentState.field_name) {
			variablesToUpdate['field_name'] = newState.field_name
		}
		if (newState.match !== currentState.match) {
			variablesToUpdate['match'] = newState.match
		}
		if (newState.match_is_running !== currentState.match_is_running) {
			variablesToUpdate['match_is_running'] = newState.match_is_running
		}

		this.setVariableValues(variablesToUpdate)
		this.checkFeedbacks(...feedbacksToUpdate)
	}

	onFieldsetClose(fieldset: Fieldset): void {
		this.log('warn', `Fieldset ${this.config.fieldset_name} closed`)
		this.updateStatus(InstanceStatus.Disconnected, `Fieldset ${this.config.fieldset_name} closed`)

		if (this.reconnectInterval == undefined) {
			this.reconnectInterval = setInterval(() => {
				this.log('debug', `Reconnecting to Fieldset ${this.config.fieldset_name}`)
				if (this.fieldset == undefined) {
					this.log('warn', 'onFieldsetClose reconnectInterval called but fieldset is undefined')
					return
				}
				fieldset
					.connect()
					.then((fieldsetRes) => {
						if (fieldsetRes.success === true) {
							this.log('debug', `Reconnecting to Fieldset ${this.config.fieldset_name} succeeded`)
							this.updateStatus(InstanceStatus.Ok)
							if (this.reconnectInterval) {
								clearInterval(this.reconnectInterval)
								this.reconnectInterval = undefined
							}
						} else {
							this.log('debug', `Reconnecting to Fieldset ${this.config.fieldset_name} failed: ${fieldsetRes.error}`)
						}
					})
					.catch((err) => {
						this.log('debug', `Reconnecting to Fieldset ${this.config.fieldset_name} error: ${err}`)
					})
			}, 10000) //attempt reconnect every 10 seconds
		}
	}

	async connectToFieldset(fieldset: Fieldset): Promise<ConnectFieldsetWebsocketResult> {
		// wire up fieldset state to instance variables
		fieldset.on('message', () => {
			this.onFieldsetMessage(fieldset)
		})

		//connect to fieldset
		const fieldsetRes = await fieldset.connect()
		if (fieldsetRes.success === false) {
			const error_msg = `Connecting to Fieldset ${this.config.fieldset_name} failed: ${fieldsetRes.error}`
			return { success: false, error_msg, error_result: fieldsetRes }
		}

		//add websocket health event listeners
		fieldset.websocket?.addEventListener('close', () => {
			this.onFieldsetClose(fieldset)
		})
		fieldset.websocket?.addEventListener('error', (err: unknown) => {
			this.log('warn', `Fieldset ${this.config.fieldset_name} error: ${err}`)
		})

		return { success: true }
	}
}

function VexTmClientFieldIdToFieldName(fields: Field[] | undefined, fieldId: number): string | undefined {
	if (fields === undefined) {
		return undefined
	}

	const fieldName = fields.find((f) => f.id === fieldId)?.name || 'UNKNOWN'
	return fieldName
}

function VexTmClientFieldIdToFieldSeq(fields: Field[] | undefined, fieldId: number): number | undefined {
	if (fields === undefined) {
		return undefined
	}

	const fieldSeq = fields.findIndex((f) => f.id === fieldId)
	if (fieldSeq === -1) {
		return undefined
	}
	return fieldSeq + 1
}

type MatchTypeMatch = Extract<FieldsetMatch, { type: FieldsetActiveMatchType.Match }>
function VexTmClientMatchToString(match: MatchTypeMatch): string {
	switch (match.match.round) {
		case MatchRound.None:
			return `NONE`
		case MatchRound.Practice:
			return `P${match.match.match}`
		case MatchRound.Qualification:
			return `Q${match.match.match}`
		case MatchRound.Quarterfinal:
			return `QF ${match.match.match}-${match.match.instance}`
		case MatchRound.Semifinal:
			return `SF ${match.match.match}-${match.match.instance}`
		case MatchRound.Final:
			return `F ${match.match.match}-${match.match.instance}`
		case MatchRound.RoundOf16:
			return `R16 ${match.match.match}-${match.match.instance}`
		case MatchRound.RoundOf32:
			return `R32 ${match.match.match}-${match.match.instance}`
		case MatchRound.RoundOf64:
			return `R64 ${match.match.match}-${match.match.instance}`
		case MatchRound.RoundOf128:
			return `R128 ${match.match.match}-${match.match.instance}`
		case MatchRound.TopN:
			return `F${match.match.match}`
		case MatchRound.RoundRobin:
			return `ROUND ROBIN`
		case MatchRound.Skills:
			return `SKILLS`
		case MatchRound.Timeout:
			return `TIMEOUT`
		default:
			return `UNKNOWN`
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)

type GetFieldSetResult =
	| {
			success: true
			fieldset: Fieldset
	  }
	| {
			success: false
			error_msg: string
			error_result?: unknown
	  }

async function getFieldset(tmClientArgs: ClientArgs, fieldsetName: string): Promise<GetFieldSetResult> {
	// create TM client
	const client = new Client(tmClientArgs)
	const connectionRes = await client.connect()
	if (connectionRes.success === false) {
		const error_msg = `Connection to TM Failed: ${connectionRes.error}`
		return { success: false, error_msg, error_result: connectionRes }
	}

	//get fieldsets
	const fieldsetsRes = await client.getFieldsets()
	if (fieldsetsRes.success === false) {
		const error_msg = `Getting Fieldsets failed: ${fieldsetsRes.error}`
		return { success: false, error_msg, error_result: fieldsetsRes }
	}

	//find fieldset
	const fieldset = fieldsetsRes.data.find((f) => f.name === fieldsetName)
	if (!fieldset) {
		const error_msg = `Finding Fieldset ${fieldsetName} failed: Not Found`
		return { success: false, error_msg: error_msg }
	}

	return { success: true, fieldset }
}

type GetFieldsResult =
	| {
			success: true
			fields: Field[]
	  }
	| {
			success: false
			error_msg: string
			error_result?: unknown
	  }

async function getFieldsetFields(fieldset: Fieldset): Promise<GetFieldsResult> {
	const fieldsRes = await fieldset.getFields()
	if (fieldsRes.success === false) {
		const error_msg = `Finding Fields ${fieldset.name} failed: ${fieldsRes.error}`
		return { success: false, error_msg, error_result: fieldsRes }
	}

	return { success: true, fields: fieldsRes.data }
}

type ConnectFieldsetWebsocketResult =
	| {
			success: true
	  }
	| {
			success: false
			error_msg: string
			error_result?: unknown
	  }

function VexTmClientMatchStateToVariableStateMapper(state: FieldsetState, fields: Field[]): VariableState {
	switch (state.match.type) {
		case FieldsetActiveMatchType.None:
			return {
				match: 'NONE',
				field_id: undefined,
				field_seq: undefined,
				field_name: 'UNKNOWN',
				match_is_running: false,
				audience_display: state.audienceDisplay,
			}

		case FieldsetActiveMatchType.Timeout:
			return {
				match: 'TIMEOUT',
				field_id: state.match.fieldID,
				field_seq: VexTmClientFieldIdToFieldSeq(fields, state.match.fieldID),
				field_name: VexTmClientFieldIdToFieldName(fields, state.match.fieldID) || 'UNKNOWN',
				match_is_running: state.match.state === FieldsetQueueState.Running ? true : false,
				audience_display: state.audienceDisplay,
			}

		case FieldsetActiveMatchType.Match:
			return {
				match: VexTmClientMatchToString(state.match),
				field_id: state.match.fieldID,
				field_seq: VexTmClientFieldIdToFieldSeq(fields, state.match.fieldID),
				field_name: VexTmClientFieldIdToFieldName(fields, state.match.fieldID) || 'UNKNOWN',
				match_is_running: state.match.state === FieldsetQueueState.Running ? true : false,
				audience_display: state.audienceDisplay,
			}
	}
}

type ConnectResult =
	| {
			success: true
	  }
	| {
			success: false
			error_msg: string
			error_result?: unknown
	  }
