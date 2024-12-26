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
