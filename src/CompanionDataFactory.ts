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
		let choices: DropdownChoice[] = []
		if (this.ms.getAppState().topState == TopState.CONNECTED) {
			const tree = await this.ms.getAllDataPaths()
			choices = this.getAllParams(tree.child, '')
		}

		const feedback = await this.buildFeedbacks(choices)
		const actions = await this.buildActions(choices)

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

	private async buildActions(pathChoices: DropdownChoice[]): Promise<CompanionActionDefinitions> {
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

		if (this.ms.getAppState().topState == TopState.CONNECTED) {
			actions.setValue = {
				name: 'Set Value',
				options: [
					{
						id: 'path',
						type: 'dropdown',
						choices: pathChoices,
						label: 'Path',
						default: '',
					},
					{
						id: 'valN',
						type: 'number',
						label: 'Value',
						default: 0,
						min: Number.MIN_VALUE,
						max: Number.MAX_VALUE,
					},
				],
				callback: async (event) => {
					this.ms.setValue(event.options.path as string, event.options.valN as number)
				},
			} as CompanionActionDefinition
			actions.toggleValue = {
				name: 'Toggle Value',
				options: [
					{
						id: 'path',
						type: 'dropdown',
						choices: pathChoices,
						label: 'Path',
						default: '',
					},
				],
				callback: async (event) => {
					await this.ms.toggleValue(event.options.path as string)
				},
			} as CompanionActionDefinition
		}
		return actions
	}

	private getAllParams(tree: Record<string, DataPathsDto>, path: string): DropdownChoice[] {
		let out: DropdownChoice[] = []
		for (const key in tree) {
			const child = tree[key]
			if (Object.prototype.hasOwnProperty.call(child, 'val')) {
				// Value list
				const prefix = path + key + '.'
				const paramNames = child.val
				for (let X = 0; X < paramNames.length; X++) {
					const valuePath = prefix + paramNames[X]
					out.push({ id: valuePath, label: valuePath } as DropdownChoice)
				}
			}

			if (Object.prototype.hasOwnProperty.call(child, 'child')) {
				// Child object
				const items = this.getAllParams(child.child, path + key + '.')
				out = out.concat(items)
			}
		}
		return out
	}

	static parseMixerSelection(mixerSelection: string): { consoleId: number; modelId: number } {
		const items = mixerSelection.split('-', 2)
		return { consoleId: parseInt(items[0]), modelId: parseInt(items[1]) }
	}
}
