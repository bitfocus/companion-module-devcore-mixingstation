import {
	combineRgb,
	CompanionActionDefinition,
	CompanionActionDefinitions,
	CompanionFeedbackDefinition,
	CompanionFeedbackDefinitions,
	DropdownChoice,
} from '@companion-module/base'
import { Logger } from './Logger.js'
import { MixingStation } from './ms/MixingStation.js'
import { DataPathsDto, TopState } from './ms/Model.js'
import { FeedbackHandler } from './ms/FeedbackHandler.js'
import { ActionFactory } from './ActionFactory.js'

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
		const actions = await this.buildActions()

		if (this.ms.getAppState().topState == TopState.CONNECTED) {
			let treeNodes: Record<string, DataPathsDto> = {}
			const tree = await this.ms.getAllDataPaths()
			if (tree.child) {
				treeNodes = tree.child
			}

			const consoleInfo = await this.ms.getConsoleInfo()

			if (this.ms.getAppState().topState == TopState.CONNECTED) {
				new ActionFactory(this.ms, consoleInfo).build(treeNodes, actions)
			}
		}

		const feedback = await this.buildFeedbacks([])
		return { actions: actions, feedback: feedback }
	}

	private async buildFeedbacks(pathChoices: DropdownChoice[]): Promise<CompanionFeedbackDefinitions> {
		const fbk = {} as CompanionFeedbackDefinitions
		if (this.ms.getAppState().topState != TopState.CONNECTED) {
			return fbk
		}

		fbk.getValue = {
			name: 'Mixer value',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'path',
					type: 'dropdown',
					choices: pathChoices,
					label: 'Path',
					default: '',
				},
			],
			callback: async (feedback) => {
				const path = feedback.options.path as string
				if (path == '') {
					return
				}

				this.logger.debug('Callback: ' + path)
				if (!this.ms.isConnected()) {
					return false
				}
				const value = this.feedbackHandler.getValue(path)
				if (typeof value === 'boolean') return value
				if (typeof value === 'number') return value > 0.5

				return false
			},
			subscribe: async (feedback) => {
				const path = feedback.options.path as string
				if (path == '') {
					return
				}
				this.logger.debug('Subscribe fbk: ' + path)
				this.feedbackHandler.mapFeedback(feedback.id, path)
			},
			unsubscribe: async (feedback) => {
				const path = feedback.options.path as string
				if (path == '') {
					return
				}
				this.logger.debug('Unsubscribe fbk: ' + path)
				this.feedbackHandler.removeFeedback(feedback.id, path)
			},
		} as CompanionFeedbackDefinition
		return fbk
	}

	private async buildActions(): Promise<CompanionActionDefinitions> {
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
