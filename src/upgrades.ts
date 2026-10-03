import type {
	CompanionMigrationAction,
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
				updatePaths(action)
				result.updatedActions.push(action)
				continue
			}

			if (action.actionId == 'setValue') {
				if (updatePaths(action)) {
					result.updatedActions.push(action)
				}
			}
		}
		return result
	},
]

function updatePaths(action: CompanionMigrationAction): boolean {
	if (!action.options.path) {
		return false
	}

	const path = action.options.path as string
	if (path.startsWith('ch.')) {
		const chId = path.split('.')[1]
		action.actionId = 'setChValue'
		action.options.ch = 'ch.' + chId
		return true
	}
	if (path.startsWith('fx.')) {
		action.actionId = 'setFxValue'
		return true
	}
	return false
}
