const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, errors } = format;
require('winston-daily-rotate-file');

const customFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
});

const logger = createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        customFormat
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        }),
        new transports.DailyRotateFile({
            filename: 'logs/application-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d',
            level: 'info'
        }),
        new transports.DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '30d',
            level: 'error'
        })
    ],
    exitOnError: false,
});

module.exports = logger;
