import type { CompanionVariableDefinition, InstanceBase } from '@companion-module/base'
import type { ValueType } from './Model.js'
import { MixingStation } from './MixingStation.js'
import { Logger } from '../Logger.js'

export class FeedbackHandler {
	private readonly ms: MixingStation
	private readonly logger: Logger
	private readonly module: InstanceBase<any>
	private readonly feedbackMap: Record<string, FeedbackEntry> = {}

	/**
	 * Holds a local cache of all subscribed values mapped to their path
	 */
	private readonly valueCache: Record<string, ValueType> = {}
	private readonly subscriptions: Record<string, SubscriptionEntry> = {}

	/**
	 * Listens for value changes on Mixing Station side and notifies
	 * companion about those changes
	 */
	constructor(ms: MixingStation, module: InstanceBase<any>, logger: Logger) {
		this.ms = ms
		this.module = module
		this.logger = logger
	}

	mapFeedback(id: string, path: string): void {
		if (this.feedbackMap[id]) {
			// Might get called multiple times during app initialization
			this.logger.debug('Feedback ' + id + ' already subscribed')
			return
		}
		this.feedbackMap[id] = { path: path }

		const subscription = this.subscriptions[path]
		if (subscription && subscription.usages > 0) {
			subscription.usages++
			return
		}
		// Not yet subscribed
		this.ms.subscribe(path)
		this.subscriptions[path] = { usages: 1 }
		this.updateVariables()
	}

	removeFeedback(id: string, path: string): void {
		delete this.feedbackMap[id]
		const subscription = this.subscriptions[path]
		if (!subscription) {
			this.logger.warning('No subscription found for ' + path + ' but expected one')
			return
		}

		subscription.usages--
		if (subscription.usages == 0) {
			delete this.subscriptions[path]
			this.ms.unsubscribe(path)
			this.updateVariables()
		}
	}

	getValue(path: string): ValueType | null {
		const value = this.valueCache[path]
		if (typeof value === 'undefined') return null
		return value
	}

	notifyFeedbacks(path: string, newValue: ValueType): void {
		this.valueCache[path] = newValue
		const updates: string[] = []
		for (const id in this.feedbackMap) {
			const entry = this.feedbackMap[id]
			if (entry.path !== path) {
				continue
			}
			updates.push(id)
		}
		// Update feedback states
		this.module.checkFeedbacksById(...updates)

		// Update companion variable values
		const variableId = this.toVariableId(path)
		this.module.setVariableValues({ [variableId]: newValue })
	}

	/**
	 * Updates the available variables based on the current subscriptions
	 */
	private updateVariables() {
		const variables: CompanionVariableDefinition[] = []
		for (const path in this.subscriptions) {
			variables.push({ variableId: this.toVariableId(path), name: 'Mixer: ' + path })
		}
		this.module.setVariableDefinitions(variables)
	}

	private toVariableId(path: string): string {
		return 'mixer_' + path.replaceAll('.', '-')
	}
}

interface SubscriptionEntry {
	usages: number
}

interface FeedbackEntry {
	path: string
}
