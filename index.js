const packageJson = require('./package.json')
const express = require('express')
const logger = require('bunyan').createLogger({ name: packageJson.name, level: process.env.LOG_LEVEL || 'info' })
const { clAuthenticate, clBalances, clConfig, clRunStats } = require('./chainlink')
const app = express()

const config = {
    server: {
        host: process.env.SERVER_HOST || '0.0.0.0',
        port: process.env.SERVER_PORT || 8080
    },
    chainlink: {
        url: process.env.CHAINLINK_URL || 'http://localhost:6688',
        email: process.env.CHAINLINK_EMAIL,
        password: process.env.CHAINLINK_PASSWORD,
        pageSize: parseInt(process.env.CHAINLINK_PAGE_SIZE) || 2500,
        staleAge: parseInt(process.env.CHAINLINK_STALE_AGE) || (1000 * 60 * 30)
    },
    trackRuns: process.env.TRACK_RUNS && process.env.TRACK_RUNS === 'true' ? true : false,
    trackJobs: process.env.TRACK_JOBS && process.env.TRACK_JOBS === 'true' ? true : false,
    extendedMetricsInterval: Math.round(parseInt(process.env.EXTENDED_METRICS_INTERVAL) || (1000 * 60 * 1.5)),
    meta: {
        measurement: process.env.MEASUREMENT || 'chainlink-node',
        tags: { // This is all just cleanup of a simple key value list
            ...(process.env.ADDITIONAL_TAGS || '')
                .split(',')
                .filter(v => v.indexOf('=') !== -1)
                .map(v => v
                    .split('=')
                    .map(v => (v || '').trim())
                    .filter(v => !!v)
                    .map(v => v.replace(/[^a-z0-9]/g, '-').replace(/-+/, '-'))
                )
                .filter(v => v.length === 2)
                .reduce((o, i) => (o[i[0]] = i[1], o), {}),
            ...[ // Add the fixed metadata second, so it will overwrite additional tags
                process.env.TAG_TECHNOLOGY ? ['technology', process.env.TAG_TECHNOLOGY] : undefined,
                process.env.TAG_BLOCKCHAIN ? ['blockchain', process.env.TAG_BLOCKCHAIN] : undefined,
                process.env.TAG_NETWORK ? ['network', process.env.TAG_NETWORK] : undefined,
                process.env.TAG_HOST ? ['host', process.env.TAG_HOST] : undefined
            ]
                .filter(v => !!v)
                .map(v => v.map(v => v.trim()).map(v => v.replace(/[^a-z0-9]/g, '-').replace(/-+/, '-')))
                .reduce((o, i) => (o[i[0]] = i[1], o), {})
        }
    }
}

// Pre-render the tags string
config.meta.tagString = Object.keys(config.meta.tags).map(v => `${v}=${config.meta.tags[v]}`).join(',')

// Return package name an version
app.get('/', (req, res) => res.json({name: packageJson.name, version: packageJson.version}))

// Ping endpoint that just returns OK
app.get('/ping', (req, res) => res.sendStatus(200))

let nextExtendedMetricsTimestamp = 0
let extendedMetricsRunning = false

// Render InfluxDB formatted metrics
app.get('/influxdb', async (req, res) => {
    const start = Date.now()

    try {
        try { // Fail silently, because in redundant configurations one node will always fail
            await clAuthenticate(config.chainlink)
        }
        catch (err) {
            logger.debug({ err }, (err && err.response && err.response.body) || err.message)
            return res.send('')
        }

        const [balances, configVars] = await Promise.all([
            clBalances(config.chainlink),
            clConfig(config.chainlink)
        ])

        logger.trace({ balances, configVars})

        // Compose output string. See https://docs.influxdata.com/influxdb/v1.7/write_protocols/line_protocol_tutorial/#syntax
        const output = [
            config.meta.measurement,
            config.meta.tagString ? `,${config.meta.tagString}` : '',
            `,account=${balances.account}`,
            `,oracle=${configVars.oracleContract}`,
            ' ',
            `eth=${balances.eth}`,
            `,link=${balances.link}`,
            `,gasPrice=${configVars.gasPrice}`
        ]

        // Only fetch run statistics if enabled. This might take some time
        if (config.trackRuns && (!extendedMetricsRunning || (Date.now() - nextExtendedMetricsTimestamp) > 300000) && nextExtendedMetricsTimestamp < Date.now()) {

            extendedMetricsRunning = true

            const runStats = await clRunStats(config.chainlink)

            logger.trace({ runStats })

            output.push(...[
                `,specs=${runStats.specCount}i`,
                `,runs=${runStats.totalRunCount}i`
            ])

            for (const status of Object.keys(runStats.totalStatusCounts)) {
                output.push(`,status-${status.replace(/[^a-z]/g, '-').replace(/-+/g, '-')}=${runStats.totalStatusCounts[status]}i`)
            }

            output.push(...[
                ' ',
                Date.now() * 1000000 // Fake nanoseconds. This resolution is not needed for our usecase.
            ])

            if (config.trackJobs) {
                for (const jobId of Object.keys(runStats.runCounts)) {
                    output.push(...[
                        '\n',
                        `${config.meta.measurement}-job`,
                        config.meta.tagString ? `,${config.meta.tagString}` : '',
                        `,account=${configVars.account}`,
                        `,oracle=${configVars.oracleContract}`,
                        `,job=${jobId}`,
                        ' ',
                        `runs=${runStats.runCounts[jobId]}`,
                    ])

                    for (const status of Object.keys(runStats.statusCounts[jobId])) {
                        output.push(`,status-${status.replace(/[^a-z]/g, '-').replace(/-+/g, '-')}=${runStats.statusCounts[jobId][status]}i`)
                    }

                    output.push(...[
                        ' ',
                        Date.now() * 1000000 // Fake nanoseconds. This resolution is not needed for our usecase.
                    ])
                }
            }

            extendedMetricsRunning = false // eslint-disable-line require-atomic-updates
            nextExtendedMetricsTimestamp = Date.now() + config.extendedMetricsInterval // eslint-disable-line require-atomic-updates
        }
        else {
            output.push(...[
                ' ',
                Date.now() * 1000000 // Fake nanoseconds. This resolution is not needed for our usecase.
            ])

            if (extendedMetricsRunning) {
                logger.trace('Extended metrics skipped because already running')
            }
            else if (nextExtendedMetricsTimestamp >= Date.now()) {
                logger.trace('Extended metrics skipped because waiting interval is not over yet')
            }
        }

        res.send(output.join(''))
        logger.trace('Took %sms', Date.now() - start)
    }
    catch (err) {
        logger.error({ err }, (err && err.response && err.response.body) || err.message)
        res.sendStatus(500)
    }
})

app.listen(config.server.port, config.server.host, () => {
    logger.info(`Server listening on ${config.server.host}:${config.server.port}`)
})
