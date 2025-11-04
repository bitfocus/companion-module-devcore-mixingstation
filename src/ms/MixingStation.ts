import WebSocket from 'ws'
import { clearTimeout } from 'node:timers'
import { Logger } from '../Logger.js'
import { AppStateDto, ConsoleListDto, DataDefinitionsV2, DataPathsDto, TopState, ValueDto, ValueType } from './Model.js'

export interface MsEvents {
	onConnected(): void

	onConnectionLost(errorMsg: string): void

	/**
	 * Gets called when the state of the app has been changed
	 */
	onAppStateChanged(state: AppStateDto): void

	/**
	 * Gets called when a new value has been received
	 * @param path Path of the value
	 * @param newVal Value, might be boolean, string or number
	 */
	onValueChanged(path: string, newVal: ValueType): void
}

const APP_STATE = '/app/state'
const VALUE_RESPONSE = '/console/data/get/'

export class MixingStation {
	private ws: WebSocket | null = null
	private active: boolean = false

	/**
	 * Interval for websocket keep-alive
	 */
	private ping: NodeJS.Timeout | null = null

	/**
	 * Holds the current app state
	 */
	private currentAppState: AppStateDto = { state: 'idle', topState: TopState.IDLE }

	/**
	 * List of requests which are waiting for a response
	 */
	private pendingRequests: PendingMsMessage[] = []

	private readonly logger: Logger
	private readonly host: string
	private readonly port: number
	private readonly listener: MsEvents

	private readonly valueFormat = 'val'

	constructor(host: string, port: number, log: Logger, listener: MsEvents) {
		this.host = host
		this.port = port
		this.logger = log
		this.listener = listener
	}

	isConnected(): boolean {
		return this.ws != null && this.ws.readyState == WebSocket.OPEN
	}

	subscribe(path: string): void {
		this.logger.debug('Subscr: ' + path)
		this.send('/console/data/subscribe', 'POST', { path: path, format: this.valueFormat })
	}

	unsubscribe(path: string): void {
		this.logger.debug('Unsubscr: ' + path)
		this.send('/console/data/unsubscribe', 'POST', { path: path, format: this.valueFormat })
	}

	setValue(path: string, value: number): void {
		this.send('/console/data/set/' + path + '/' + this.valueFormat, 'POST', { value: value })
	}

	async toggleValue(path: string): Promise<void> {
		// We don't necessarily have the current state
		const currentValue = await this.getValue(path)
		let newValue: any = null
		if (typeof currentValue.value === 'boolean') {
			newValue = !currentValue.value
		} else if (typeof currentValue.value === 'number') {
			// We need details about the value range of this parameter
			const def = await this.getValueDefinition(path)
			if (def.value == null) {
				this.logger.warning('Value has no definition ' + path)
				return
			}

			if (def.value.enums == null) {
				this.logger.warning('Unsupported type for toggle ' + typeof def.value.type)
				return
			}
			// Find current and toggle
			const enumId = currentValue.value

			for (let X = 0; X < def.value.enums.length; X++) {
				if (def.value.enums[X].id == enumId) {
					// Use next enum
					let targetEnum = X + 1
					if (targetEnum >= def.value.enums.length) {
						targetEnum = 0
					}
					newValue = def.value.enums[targetEnum].id
					break
				}
			}
		} else {
			this.logger.warning('Unsupported type for toggle ' + typeof currentValue.value)
			return
		}
		this.send('/console/data/set/' + path + '/' + this.valueFormat, 'POST', { value: newValue })
	}

	async getValue(path: string): Promise<ValueDto> {
		const msg = await this.getResponse('/console/data/get/' + path + '/' + this.valueFormat, 'GET', null)
		return msg.body as ValueDto
	}

	async getValueDefinition(path: string): Promise<DataDefinitionsV2> {
		const msg = await this.getResponse('/console/data/definitions2/' + path, 'GET', null)
		return msg.body as DataDefinitionsV2
	}

	async getAllDataPaths(): Promise<DataPathsDto> {
		const msg = await this.getResponse('/console/data/paths', 'GET', null)
		return msg.body
	}

	async getAvailableMixers(): Promise<ConsoleListDto> {
		const response = await this.getResponse('/app/mixers/available', 'GET', null)
		return response.body as ConsoleListDto
	}

	getAppState(): AppStateDto {
		return this.currentAppState
	}

	startOfflineMode(consoleId: number, modelId: number): void {
		this.send('/app/mixers/offline', 'POST', { consoleId: consoleId, modelId: modelId })
	}

	connectToMixer(consoleId: number, host: string): void {
		this.send('/app/mixers/connect', 'POST', { consoleId: consoleId, ip: host })
	}

	connect(): void {
		if (this.active) {
			this.disconnect()
		}

		this.logger.debug('Connect to ' + this.host + ':' + this.port)
		this.active = true
		this.ws = new WebSocket('ws://' + this.host + ':' + this.port)
		this.ws.on('error', (err) => {
			this.onError(err)
		})

		this.ws.on('open', () => {
			this.onConnected()
		})
		this.ws.on('close', (code, reason) => {
			let errMsg = 'Code ' + code
			if (reason) errMsg = reason.toString() + ' ' + errMsg
			this.onConnectionLost(errMsg)
		})
		this.ws.on('message', (data, isBinary) => {
			if (isBinary) return
			this.onMessage(data as Buffer)
		})
	}

	disconnect(): void {
		this.logger.debug('Disconnect from ' + this.host + ':' + this.port)
		this.active = false
		this.logger.debug('DC Active ' + this.active)
		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
	}

	private onConnected() {
		this.logger.debug('Connected')
		// Request app state
		this.send(APP_STATE, 'GET', null)
		this.listener.onConnected()

		// Start ping
		if (this.ping) clearTimeout(this.ping)
		this.ping = setInterval(() => {
			if (!this.ws) return
			try {
				this.ws.ping()
			} catch (_) {
				// Ignore
			}
		}, 1000)
	}

	private onConnectionLost(errMsg: string) {
		this.logger.warning('Connection lost: ' + errMsg)
		this.listener.onConnectionLost(errMsg)
		if (this.ping) {
			clearTimeout(this.ping)
			this.ping = null
		}

		if (this.active) {
			// Reconnect
			setTimeout(() => {
				if (!this.active) {
					// Has been deactivated in the meantime
					return
				}
				this.logger.debug('Reconnecting...')
				this.connect()
			}, 1000)
		}
	}

	private onMessage(data: Buffer): void {
		const message = JSON.parse(data.toString()) as MsMessage
		if (message.error) {
			this.logger.warning('Error response: ' + message.path + ': ' + message.error)
			return
		}
		if (message.path === APP_STATE) {
			const state = message.body as AppStateDto
			this.currentAppState = state
			this.listener.onAppStateChanged(state)
		}
		if (message.path.startsWith(VALUE_RESPONSE)) {
			const path = message.path.replace(VALUE_RESPONSE, '')
			const value = message.body as ValueDto
			this.listener.onValueChanged(path, value.value)
		}

		for (let X = 0; X < this.pendingRequests.length; X++) {
			const req = this.pendingRequests[X]
			if (req.path == message.path && req.method == message.method) {
				req.callback(message)
				req.resolved = true
			}
		}
		this.pendingRequests.filter((r) => r.resolved)
		// this.logger.debug('Received: ' + data)
	}

	private onError(err: Error) {
		this.logger.error('WS onError: ' + err)
	}

	/**
	 * Sends a message to MS and waits for the response
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	private getResponse(path: string, method: string, payload: any): Promise<MsMessage> {
		return new Promise((resolve) => {
			this.pendingRequests.push({
				path: path,
				method: method,
				body: payload,
				callback(msg: MsMessage) {
					resolve(msg)
				},
			} as PendingMsMessage)

			this.send(path, method, payload)
		})
	}

	/**
	 * Sends a message to MS
	 */
	private send(path: string, method: string, payload: any): boolean {
		if (!this.isConnected()) return false

		const data = { path: path, method: method, body: payload } as MsMessage
		this.ws?.send(JSON.stringify(data), { binary: false, compress: false })
		return true
	}
}

interface MsMessage {
	path: string
	method: string
	body: any
	error: string | undefined
}

interface PendingMsMessage extends MsMessage {
	callback(msg: MsMessage): void

	resolved: boolean
}
