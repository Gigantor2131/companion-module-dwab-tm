import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, ModuleSecretConfig, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import {
	Client,
	FieldsetActiveMatchType,
	FieldsetState,
	MatchRound,
	type ClientArgs,
	type Fieldset,
} from 'vex-tm-client'

export class ModuleInstance extends InstanceBase<ModuleConfig, ModuleSecretConfig> {
	config!: ModuleConfig // Setup in init()
	secrets!: ModuleSecretConfig // Setup in init()
	client?: Client = undefined
	fieldset?: Fieldset = undefined
	reconnectInterval?: NodeJS.Timeout = undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecretConfig): Promise<void> {
		this.config = config
		this.secrets = secrets
		this.log('debug', `init ${JSON.stringify({ config: this.config, secrets: this.secrets })}`)

		//connect to TM
		await this.connectToTM()
		await this.connectToFieldset()

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecretConfig): Promise<void> {
		this.log('debug', `configUpdated`)
		const oldConfig = this.config
		const oldSecrets = this.secrets
		this.config = config
		this.secrets = secrets

		//if TM config updated reconnect to TM
		if (
			this.config.ip !== oldConfig.ip ||
			this.secrets.api_key !== oldSecrets.api_key ||
			this.config.client_id !== oldConfig.client_id ||
			this.secrets.client_secret !== oldSecrets.client_secret ||
			this.config.client_expiration !== oldConfig.client_expiration
		) {
			this.log('debug', `configUpdated - TM connection changed`)
			await this.connectToTM()
		} else {
			this.log('debug', `configUpdated - TM connection not changed`)
		}

		//if Fieldset config updated reconnect to Fieldset
		if (this.config.fieldset_name !== oldConfig.fieldset_name) {
			this.log('debug', `configUpdated - Fieldset connection changed`)
			await this.connectToFieldset()
		} else {
			this.log('debug', `configUpdated - Fieldset connection not changed`)
		}
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

	async connectToTM(): Promise<void> {
		this.log('debug', 'Connecting to TM')
		if (
			this.config.client_id === undefined ||
			this.secrets.client_secret === undefined ||
			this.config.client_expiration === undefined
		) {
			this.updateStatus(InstanceStatus.BadConfig, 'tm api credentials not provided')
			return
		}

		if (this.config.ip === undefined || this.secrets.api_key === undefined) {
			this.updateStatus(InstanceStatus.BadConfig, 'tm connection info not provided')
			return
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
		const client = new Client(clientArgs)
		const connectionRes = await client.connect()
		if (connectionRes.success === false) {
			this.updateStatus(InstanceStatus.ConnectionFailure, `Connection to TM Failed: ${connectionRes.error}`)
			return
		}
		this.log('debug', 'Connecting to TM: succeeded')

		this.client = client
		return
	}
	async connectToFieldset(): Promise<void> {
		this.log('debug', 'Connecting to Fieldset')

		if (this.config.fieldset_name === undefined) {
			this.updateStatus(InstanceStatus.BadConfig, 'fieldset connection info not provided')
			return
		}
		const client = this.client
		if (!client) {
			this.updateStatus(InstanceStatus.ConnectionFailure, 'vex-tm-client was undefined')
			return
		}

		//get fieldsets
		this.log('debug', 'Getting Fieldsets')
		const fieldsetsRes = await client.getFieldsets()
		if (fieldsetsRes.success === false) {
			this.updateStatus(InstanceStatus.ConnectionFailure, `Getting Fieldsets failed: ${fieldsetsRes.error}`)
			return
		}
		this.log('debug', 'Getting Fieldsets succeeded')

		//find fieldset
		this.log('debug', `Finding Fieldset ${this.config.fieldset_name}`)
		const fieldset = fieldsetsRes.data.find((f) => f.name === this.config.fieldset_name)
		if (!fieldset) {
			this.updateStatus(
				InstanceStatus.ConnectionFailure,
				`Finding Fieldset ${this.config.fieldset_name} failed: Not Found`,
			)
			return
		}
		this.log('debug', `Finding Fieldset ${this.config.fieldset_name} succeeded`)

		//wire up fieldset state to instance variables
		fieldset.on('message', () => {
			const last_active_field = this.getVariableValue('last_active_field')
			const activeField = VexTmClientMatchToActiveField(this.fieldset?.state)

			this.setVariableValues({
				match: VexTmClientMatchToString(this.fieldset?.state),
				last_active_field: activeField ?? last_active_field,
			})
		})

		fieldset.on('audienceDisplayChanged', () => {
			this.log('debug', `audienceDisplayChanged event received ${this.fieldset?.state.audienceDisplay}`)
			this.checkFeedbacks('audience_display')
		})

		//connect to fieldset
		this.log('debug', `Connecting to Fieldset ${this.config.fieldset_name}`)
		const fieldsetRes = await fieldset.connect()
		if (fieldsetRes.success === false) {
			this.updateStatus(
				InstanceStatus.ConnectionFailure,
				`Connecting to Fieldset ${this.config.fieldset_name} failed: ${fieldsetRes.error}`,
			)
			return
		}
		this.updateStatus(InstanceStatus.Ok)
		this.log('debug', `Connecting to Fieldset ${this.config.fieldset_name} succeeded`)

		//add websocket health event listeners
		fieldset.websocket?.addEventListener('close', () => {
			this.log('warn', `Fieldset ${this.config.fieldset_name} closed`)
			this.updateStatus(InstanceStatus.Disconnected, `Fieldset ${this.config.fieldset_name} closed`)

			if (this.reconnectInterval == undefined) {
				this.reconnectInterval = setInterval(() => {
					this.log('debug', `Reconnecting to Fieldset ${this.config.fieldset_name}`)
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
		})
		fieldset.websocket?.addEventListener('error', (err: unknown) => {
			this.log('warn', `Fieldset ${this.config.fieldset_name} error: ${err}`)
		})
		this.fieldset = fieldset

		this.log('debug', 'Connecting to Fieldset: succeeded')
	}
}

function VexTmClientMatchToString(state?: FieldsetState): string {
	if (!state) {
		return 'UNDEFINED'
	}
	switch (state.match.type) {
		case FieldsetActiveMatchType.None:
			return 'NONE'
		case FieldsetActiveMatchType.Timeout:
			return `TIMEOUT`
		case FieldsetActiveMatchType.Match:
			switch (state.match.match.round) {
				case MatchRound.None:
					return `NONE`
				case MatchRound.Practice:
					return `P${state.match.match.match}`
				case MatchRound.Qualification:
					return `Q${state.match.match.match}`
				case MatchRound.Quarterfinal:
					return `QF ${state.match.match.match}-${state.match.match.instance}`
				case MatchRound.Semifinal:
					return `SF ${state.match.match.match}-${state.match.match.instance}`
				case MatchRound.Final:
					return `F ${state.match.match.match}-${state.match.match.instance}`
				case MatchRound.RoundOf16:
					return `R16 ${state.match.match.match}-${state.match.match.instance}`
				case MatchRound.RoundOf32:
					return `R32 ${state.match.match.match}-${state.match.match.instance}`
				case MatchRound.RoundOf64:
					return `R64 ${state.match.match.match}-${state.match.match.instance}`
				case MatchRound.RoundOf128:
					return `R128 ${state.match.match.match}-${state.match.match.instance}`
				case MatchRound.TopN:
					return `F${state.match.match.match}`
				case MatchRound.RoundRobin:
					return `ROUND ROBIN`
				case MatchRound.Skills:
					return `SKILLS`
				case MatchRound.Timeout:
					return `TIMEOUT`
			}
	}
}
function VexTmClientMatchToActiveField(state?: FieldsetState): number | undefined {
	if (!state) {
		return undefined
	}
	switch (state.match.type) {
		case FieldsetActiveMatchType.None:
			return undefined
		case FieldsetActiveMatchType.Timeout:
		case FieldsetActiveMatchType.Match:
			return state.match.fieldID
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
