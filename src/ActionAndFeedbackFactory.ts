import {
	combineRgb,
	CompanionActionDefinition,
	CompanionActionDefinitions,
	CompanionFeedbackDefinition,
	CompanionFeedbackDefinitions,
	CompanionOptionValues,
	DropdownChoice,
} from '@companion-module/base'
import { MODE_SET_RELATIVE, MODE_TOGGLE } from './consts.js'
import { MixingStation } from './ms/MixingStation.js'
import { ConsoleInformationDto, DataPathsDto } from './ms/Model.js'
import { Logger } from './Logger.js'
import { FeedbackHandler } from './ms/FeedbackHandler.js'

export class ActionAndFeedbackFactory {
	private channelSelections: DropdownChoice[] = []

	/**
	 * All channel data nodes merged into one
	 **/
	private chTree: Record<string, DataPathsDto> = {}
	private fxTree: Record<string, DataPathsDto> = {}
	private remainingTree: Record<string, DataPathsDto> = {}

	private readonly ms: MixingStation
	private readonly consoleInfo: ConsoleInformationDto

	private readonly feedbackHandler: FeedbackHandler
	private readonly logger: Logger

	constructor(ms: MixingStation, consoleInfo: ConsoleInformationDto, feedbackHandler: FeedbackHandler, logger: Logger) {
		this.ms = ms
		this.consoleInfo = consoleInfo
		this.feedbackHandler = feedbackHandler
		this.logger = logger
	}

	build(
		valueTree: Record<string, DataPathsDto>,
		actions: CompanionActionDefinitions,
		feedback: CompanionFeedbackDefinitions,
	): void {
		this.parseTree(valueTree)

		const chParams = this.treeToDropdown(this.chTree, '')
		actions.setChValue = this.buildValueAction('Set Value (Channel)', chParams, {
			finalize: (action) => {
				action.options.splice(1, 0, {
					id: 'ch',
					type: 'dropdown',
					choices: this.channelSelections,
					label: 'Channel',
					default: 'ch.0',
				})
			},
			getPrefix(options) {
				return (options.ch as string) + '.'
			},
		})

		feedback.setChValue = this.buildValueFeedback('Value (Channel)', chParams, {
			finalize: (feedback) => {
				feedback.options.splice(1, 0, {
					id: 'ch',
					type: 'dropdown',
					choices: this.channelSelections,
					label: 'Channel',
					default: 'ch.0',
				})
			},
			getPrefix(options) {
				return (options.ch as string) + '.'
			},
		})

		const fxParams = this.treeToDropdown(this.fxTree, '')
		actions.setFxValue = this.buildValueAction('Set Value (FX)', fxParams, {
			finalize: (_action) => {},
			getPrefix(_options) {
				return ''
			},
		})
		feedback.setFxValue = this.buildValueFeedback('Value (FX)', fxParams, {
			finalize: (_feedback) => {},
			getPrefix(_options) {
				return ''
			},
		})

		const otherParams = this.treeToDropdown(this.remainingTree, '')
		actions.setValue = this.buildValueAction('Set Value (Others)', otherParams, {
			finalize: (_action) => {},
			getPrefix(_options) {
				return ''
			},
		})
		feedback.setValue = this.buildValueFeedback('Value (Others)', otherParams, {
			finalize: (_feedback) => {},
			getPrefix(_options) {
				return ''
			},
		})
	}

	private parseTree(valueTree: Record<string, DataPathsDto>) {
		this.channelSelections = []
		this.chTree = {}
		this.fxTree = {}
		this.remainingTree = {}
		for (const key in valueTree) {
			const node = valueTree[key]
			if (key == 'fx') {
				this.fxTree[key] = node
				continue
			}
			if (key == 'ch') {
				for (const chId in node.child) {
					const channelIndex = parseInt(chId)
					this.channelSelections.push({ id: key + '.' + chId, label: this.getGenericChannelName(channelIndex) })
					const ch = node.child[chId]
					if (ch.child) {
						this.mergeInto(ch.child, this.chTree)
					}
				}
				continue
			}

			this.remainingTree[key] = node
		}
	}

	private mergeInto(source: Record<string, DataPathsDto>, dest: Record<string, DataPathsDto>) {
		for (const key in source) {
			if (!dest[key]) {
				dest[key] = source[key]
				continue
			}

			const child = source[key]
			if (child.child) {
				if (!dest[key].child) {
					// Should never happen as we just copy the tree
					continue
				}
				this.mergeInto(child.child, dest[key].child)
			}
		}
	}

	private treeToDropdown(tree: Record<string, DataPathsDto>, path: string): DropdownChoice[] {
		let out: DropdownChoice[] = []
		for (const key in tree) {
			const child = tree[key]
			if (child.val) {
				// Value list
				const prefix = path + key + '.'
				const paramNames = child.val
				for (let X = 0; X < paramNames.length; X++) {
					const valuePath = prefix + paramNames[X]
					out.push({ id: valuePath, label: valuePath } as DropdownChoice)
				}
			}

			if (child.child) {
				// Child object
				const items = this.treeToDropdown(child.child, path + key + '.')
				out = out.concat(items)
			}
		}
		return out
	}

	private getGenericChannelName(channelIndex: number): string {
		for (const channelType of this.consoleInfo.channelTypes) {
			if (channelIndex < channelType.offset || channelIndex >= channelType.offset + channelType.count) continue
			return channelType.name + ' ' + (channelIndex - channelType.offset + 1)
		}
		return 'N/A'
	}

	buildValueAction(name: string, pathChoices: DropdownChoice[], decorator: ActionDecorator): CompanionActionDefinition {
		const action = {
			name: name,
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					choices: [
						{ id: 'setAbs', label: 'Set Absolute' },
						{ id: MODE_SET_RELATIVE, label: 'Set Relative' },
						{ id: MODE_TOGGLE, label: 'Toggle' },
					],
					label: 'Mode',
					default: 'setAbs',
				},
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
					min: -50_000,
					max: Number.MAX_VALUE,
					isVisibleExpression: '$(options:mode) != "' + MODE_TOGGLE + '"',
				},
				{
					id: 'fT',
					type: 'number',
					label: 'Fade Time (ms)',
					default: 0,
					min: 0,
					max: 10000,
					isVisibleExpression: '$(options:mode) != "' + MODE_TOGGLE + '"',
				},
			],

			callback: async (event) => {
				const mode = event.options.mode as string
				const path = decorator.getPrefix(event.options) + (event.options.path as string)
				if (mode == MODE_TOGGLE) {
					await this.ms.toggleValue(path)
					return
				}
				if (mode == MODE_SET_RELATIVE) {
					await this.ms.setValueRelative(path, event.options.valN as number, event.options.fT as number)
					return
				}

				await this.ms.setValue(path, event.options.valN as number, event.options.fT as number)
			},

			subscribe: async (info) => {
				const path = decorator.getPrefix(info.options) + (info.options.path as string)
				if (path == '') {
					return
				}
				this.logger.debug('Subscribe act: ' + path)
				this.feedbackHandler.subscribeValue(path)
			},
			unsubscribe: async (info) => {
				const path = decorator.getPrefix(info.options) + (info.options.path as string)
				if (path == '') {
					return
				}
				this.logger.debug('Unsubscribe act: ' + path)
				this.feedbackHandler.unsubscribeValue(path)
			},
		} as CompanionActionDefinition

		decorator.finalize(action)
		return action
	}

	buildValueFeedback(
		name: string,
		pathChoices: DropdownChoice[],
		decorator: FeedbackDecorator,
	): CompanionFeedbackDefinition {
		const feedback = {
			name: name,
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
				const path = decorator.getPrefix(feedback.options) + (feedback.options.path as string)
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
				const path = decorator.getPrefix(feedback.options) + (feedback.options.path as string)
				if (path == '') {
					return
				}
				this.logger.debug('Subscribe fbk: ' + path)
				this.feedbackHandler.mapFeedback(feedback.id, path)
			},
			unsubscribe: async (feedback) => {
				const path = decorator.getPrefix(feedback.options) + (feedback.options.path as string)
				if (path == '') {
					return
				}
				this.logger.debug('Unsubscribe fbk: ' + path)
				this.feedbackHandler.removeFeedback(feedback.id, path)
			},
		} as CompanionFeedbackDefinition
		decorator.finalize(feedback)
		return feedback
	}
}

interface PrefixProvider {
	getPrefix(options: CompanionOptionValues): string
}

interface ActionDecorator extends PrefixProvider {
	finalize(action: CompanionActionDefinition): void
}

interface FeedbackDecorator extends PrefixProvider {
	finalize(action: CompanionFeedbackDefinition): void
}
