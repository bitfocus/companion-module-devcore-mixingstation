import type {
	CompanionMigrationAction,
	CompanionMigrationFeedback,
	CompanionStaticUpgradeScript,
	CompanionUpgradeContext,
} from '@companion-module/base'
import { CompanionStaticUpgradeProps, CompanionStaticUpgradeResult } from '@companion-module/base'
import type { ModuleConfig } from './config.js'
import { MODE_TOGGLE } from './consts.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	/*
	 * Place your upgrade scripts here
	 * Remember that once it has been added it cannot be removed!
	 */
	function (
		_context: CompanionUpgradeContext<ModuleConfig>,
		props: CompanionStaticUpgradeProps<ModuleConfig>,
	): CompanionStaticUpgradeResult<ModuleConfig> {
		const result: CompanionStaticUpgradeResult<ModuleConfig> = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		for (const action of props.actions) {
			if (action.actionId == 'toggleValue') {
				action.actionId = 'setValue'
				action.options.mode = MODE_TOGGLE
			} else if (action.actionId != 'setValue') {
				continue
			}

			updatePaths(action)
			action.options.mode ??= 'setAbs'
			action.options.fT ??= 0
			result.updatedActions.push(action)
		}

		for (const feedback of props.feedbacks) {
			if (feedback.feedbackId != 'getValue') {
				continue
			}

			updatePaths(feedback)
			result.updatedFeedbacks.push(feedback)
		}

		return result
	},
]

function updatePaths(entry: CompanionMigrationAction | CompanionMigrationFeedback): boolean {
	if (!entry.options.path) {
		return false
	}

	const path = entry.options.path as string
	if (path.startsWith('ch.')) {
		const parts = path.split('.')
		setId(entry, 'setChValue')
		entry.options.ch = 'ch.' + parts[1]
		entry.options.path = parts.slice(2).join('.')
		return true
	}
	if (path.startsWith('fx.')) {
		setId(entry, 'setFxValue')
		return true
	}
	setId(entry, 'setValue')
	return true
}

function setId(entry: CompanionMigrationAction | CompanionMigrationFeedback, id: string): void {
	if ('actionId' in entry) {
		entry.actionId = id
	} else {
		entry.feedbackId = id
	}
}
