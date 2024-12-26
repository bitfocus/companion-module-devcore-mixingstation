import type { SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'IP address where Mixing Station is running',
			width: 8,
			regex: '.+',
			default: 'localhost',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Mixing Station REST port',
			width: 4,
			min: 1,
			max: 65535,
			default: 8080,
		},
	]
}
