import { InstanceBase, InstanceStatus, runEntrypoint, SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { MixingStation, MsEvents } from './ms/MixingStation.js'
import { ModuleLogger } from './Logger.js'
import { CompanionDataFactory } from './CompanionDataFactory.js'
import { AppStateDto, TopState, ValueType } from './ms/Model.js'
import { FeedbackHandler } from './ms/FeedbackHandler.js'

export class ModuleInstance extends InstanceBase<ModuleConfig> implements MsEvents {
	config!: ModuleConfig // Setup in init()

	ms: MixingStation | null = null
	feedbackHandler: FeedbackHandler | null = null
	private logger: ModuleLogger

	constructor(internal: unknown) {
		super(internal)
		this.logger = new ModuleLogger(this, 'main')
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		await this.updateCompanionDefinitions()
		this.connectToMs()
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.logger.debug('destroy')
		if (this.ms) {
			this.ms.disconnect()
			this.ms = null
		}
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.logger.debug('config updated')
		this.config = config
		this.ms?.disconnect()
		this.connectToMs()
	}

	onConnected(): void {
		this.updateStatus(InstanceStatus.Ok)
	}

	onConnectionLost(errMsg: string): void {
		this.updateStatus(InstanceStatus.ConnectionFailure, errMsg)
	}

	onAppStateChanged(state: AppStateDto): void {
		this.logger.debug('App state changed: ' + state.topState)
		if (state.topState == TopState.CONNECTED || state.topState == TopState.IDLE) {
			// MS is connected to a mixer
			// -> Refresh available actions
			void this.updateCompanionDefinitions().then(() => {})
		}
	}

	onValueChanged(path: string, newValue: ValueType): void {
		this.feedbackHandler?.notifyFeedbacks(path, newValue)
	}

	private connectToMs(): void {
		this.updateStatus(InstanceStatus.Connecting, this.config.host + ':' + this.config.port)
		this.ms = new MixingStation(this.config.host, this.config.port, new ModuleLogger(this, 'MS'), this)
		this.feedbackHandler = new FeedbackHandler(this.ms, this, new ModuleLogger(this, 'Fdk'))
		this.ms.connect()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	async updateCompanionDefinitions(): Promise<void> {
		this.logger.debug('Updating actions')
		if (!this.ms || !this.feedbackHandler) return

		const logger = new ModuleLogger(this, 'DataFactory')
		const data = await new CompanionDataFactory(this.ms, this.feedbackHandler, logger).build()
		this.setActionDefinitions(data.actions)
		this.setFeedbackDefinitions(data.feedback)

		// Update any feedbacks used by companion
		this.subscribeFeedbacks()
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
