import type { InstanceBase } from '@companion-module/base'

export interface Logger {
	error(message: string): void

	warning(message: string): void

	info(message: string): void

	debug(message: string): void
}

export class ModuleLogger implements Logger {
	private readonly instance: InstanceBase<any>
	private readonly tag: string

	constructor(instance: InstanceBase<any>, tag: string) {
		this.instance = instance
		this.tag = '[' + tag + '] '
	}

	error(message: string): void {
		this.instance.log('error', this.tag + message)
	}

	warning(message: string): void {
		this.instance.log('warn', this.tag + message)
	}

	info(message: string): void {
		this.instance.log('info', this.tag + message)
	}

	debug(message: string): void {
		this.instance.log('debug', this.tag + message)
	}
}
