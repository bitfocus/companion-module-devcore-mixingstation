export enum TopState {
	IDLE = 'idle',
	CONNECTING = 'connecting',
	CONNECTED = 'connected',
	RECONNECTING = 'reconnecting',
}

export interface AppStateDto {
	state: string
	topState: TopState
	msg?: string
	progress?: number
}

export type ValueType = string | number | boolean

export interface ValueDto {
	value: ValueType
	format: string
}

export interface ConsoleListDto {
	consoles: ConsoleFactoryDto[]
}

export interface ConsoleFactoryDto {
	manufacturer: string
	name: string
	consoleId: number
	models: string[]
	supportedHardwareModels: string[]
}

export interface DataPathsDto {
	val: string[]
	child: Record<string, DataPathsDto>
}

export interface DataDefinitionsV2 {
	value: ValueConverterDtoV2 | null
	node: NodeDefinitionDtoV2 | null
}
export interface ValueConverterDtoV2 {
	type: string
	unit: string
	min: number | null
	max: number | null
	delta: number | null
	enums: EnumDto[]
	tap: boolean | null
	constraints: string[]
}
export interface NodeDefinitionDtoV2 {
	defaultFilterType: number | null
}

export interface EnumDto {
	id: number
	name: string
}
