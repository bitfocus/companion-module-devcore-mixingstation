import {
	CompanionActionDefinition,
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	DropdownChoice,
} from '@companion-module/base'
import { Logger, ModuleLogger } from './Logger.js'
import { MixingStation } from './ms/MixingStation.js'
import { DataPathsDto, TopState } from './ms/Model.js'
import { FeedbackHandler } from './ms/FeedbackHandler.js'
import { ActionAndFeedbackFactory } from './ActionAndFeedbackFactory.js'

export interface CompanionData {
	feedback: CompanionFeedbackDefinitions
	actions: CompanionActionDefinitions
}

export class CompanionDataFactory {
	private readonly ms: MixingStation
	private readonly feedbackHandler: FeedbackHandler
	private readonly logger: Logger

	constructor(ms: MixingStation, feedbackHandler: FeedbackHandler, logger: Logger) {
		this.ms = ms
		this.feedbackHandler = feedbackHandler
		this.logger = logger
	}

	async build(): Promise<CompanionData> {
		const actions = await this.buildStaticActions()
		const feedback: CompanionFeedbackDefinitions = {}
		if (this.ms.getAppState().topState == TopState.CONNECTED) {
			let treeNodes: Record<string, DataPathsDto> = {}
			const tree = await this.ms.getAllDataPaths()
			if (tree.child) {
				treeNodes = tree.child
			}

			const consoleInfo = await this.ms.getConsoleInfo()

			if (this.ms.getAppState().topState == TopState.CONNECTED) {
				new ActionAndFeedbackFactory(
					this.ms,
					consoleInfo,
					this.feedbackHandler,
					new ModuleLogger(this.logger.root, 'ActionAndFbkFactory'),
				).build(treeNodes, actions, feedback)
			}
		}

		return { actions: actions, feedback: feedback }
	}

	private async buildStaticActions(): Promise<CompanionActionDefinitions> {
		const actions = {} as CompanionActionDefinitions
		if (!this.ms.isConnected()) {
			return actions
		}

		const consoles = await this.ms.getAvailableMixers()
		const consoleIdOption = {
			id: 'mixerSelection',
			type: 'dropdown',
			choices: consoles.consoles
				.map((c) => {
					return c.modelEnums.map((model) => {
						return {
							id: c.consoleId + '-' + model.id,
							label: c.manufacturer + ' ' + c.name + ' ' + model.name,
						} as DropdownChoice
					})
				})
				.flat(),
			label: 'Console',
			default: '',
		}

		actions.connectMixer = {
			name: 'Connect to Mixer',
			options: [
				consoleIdOption,
				{
					id: 'host',
					type: 'textinput',
					label: 'Console IP/Host',
				},
			],
			callback: async (event) => {
				const { consoleId } = CompanionDataFactory.parseMixerSelection(event.options.mixerSelection as string)
				this.ms.connectToMixer(consoleId, event.options.host as string)
			},
		} as CompanionActionDefinition

		actions.startOffline = {
			name: 'Start Offline',
			options: [consoleIdOption],
			callback: async (event) => {
				const { consoleId, modelId } = CompanionDataFactory.parseMixerSelection(event.options.mixerSelection as string)
				this.ms.startOfflineMode(consoleId, modelId)
			},
		} as CompanionActionDefinition
		return actions
	}

	static parseMixerSelection(mixerSelection: string): { consoleId: number; modelId: number } {
		const items = mixerSelection.split('-', 2)
		return { consoleId: parseInt(items[0]), modelId: parseInt(items[1]) }
	}
}
