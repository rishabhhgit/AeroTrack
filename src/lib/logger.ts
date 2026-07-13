type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: string
  data?: unknown
}

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: string, data?: unknown): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      data,
    }
  }

  private log(entry: LogEntry) {
    if (import.meta.env.MODE !== 'development' && entry.level === 'debug') return

    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`
    const context = entry.context ? ` [${entry.context}]` : ''

    switch (entry.level) {
      case 'error':
        console.error(`${prefix}${context} ${entry.message}`, entry.data || '')
        break
      case 'warn':
        console.warn(`${prefix}${context} ${entry.message}`, entry.data || '')
        break
      case 'info':
        console.info(`${prefix}${context} ${entry.message}`, entry.data || '')
        break
      default:
        console.debug(`${prefix}${context} ${entry.message}`, entry.data || '')
    }
  }

  debug(message: string, context?: string, data?: unknown) {
    this.log(this.formatMessage('debug', message, context, data))
  }

  info(message: string, context?: string, data?: unknown) {
    this.log(this.formatMessage('info', message, context, data))
  }

  warn(message: string, context?: string, data?: unknown) {
    this.log(this.formatMessage('warn', message, context, data))
  }

  error(message: string, context?: string, data?: unknown) {
    this.log(this.formatMessage('error', message, context, data))
  }

  request(method: string, url: string, duration?: number, status?: number) {
    const message = `${method} ${url} ${status ? `-> ${status}` : ''} ${duration ? `(${duration}ms)` : ''}`
    this.info(message, 'HTTP')
  }

  responseTime(label: string, duration: number) {
    this.debug(`${label}: ${duration}ms`, 'Performance')
  }
}

export const logger = new Logger()
