const got = require('got')
const logger = require('bunyan').createLogger({ name: 'chainlink', level: process.env.LOG_LEVEL || 'info' })
const { CookieJar } = require('tough-cookie')
const cookieJar = new CookieJar()

const WEI = Math.pow(10, 18)
const GWEI = Math.pow(10, 9)

async function authenticate(config) {
    await got.post(`${config.url}/sessions`, {
        json: {
            email: config.email,
            password: config.password
        },
        cookieJar
    }).json()
}

async function getBalances(config) {
    const balanceResult = await got(`${config.url}/v2/user/balances`, { cookieJar }).json()
    if (!balanceResult || !balanceResult.data || !balanceResult.data.length || !balanceResult.data[0].type || balanceResult.data[0].type != 'accountBalances') {
        const err = new Error('Invalid Balances Result')
        err.result = balanceResult
        throw err
    }

    return {
        account: balanceResult.data[0].attributes.address,
        eth: (parseInt(balanceResult.data[0].attributes.ethBalance) || 0) / WEI,
        link: (parseInt(balanceResult.data[0].attributes.linkBalance) || 0) / WEI
    }
}

async function getConfig(config) {
    const configResult = await got(`${config.url}/v2/config`, { cookieJar }).json()

    if (!configResult || !configResult.data || !configResult.data.type || configResult.data.type != 'configWhitelists') {
        const err = new Error('Invalid Config Result')
        err.result = configResult
        throw err
    }

    return {
        account: configResult.data.attributes.accountAddress,
        chainId: configResult.data.attributes.ethChainId,
        linkContract: configResult.data.attributes.linkContractAddress,
        oracleContract: configResult.data.attributes.oracleContractAddress,
        gasPrice: (parseInt(configResult.data.attributes.ethGasPriceDefault) || 0) / GWEI
    }
}

async function getAllRuns(config, jobSpecId, pageSize = 5000) {
    const data = []

    let runs = await got(`${config.url}/v2/runs?jobSpecId=${jobSpecId}&size=${pageSize}`, { cookieJar }).json()
    data.push(...runs.data)

    while (runs.links && runs.links.next) {
        logger.trace({ next: runs.links.next}, 'Paginating')

        runs = await got(`${config.url}${runs.links.next}`, { cookieJar }).json()
        data.push(...runs.data)
    }

    return {
        data,
        meta: {
            count: data.length
        }
    }
}

async function getRunStats(config) {
    const specs = await got(`${config.url}/v2/specs`, { cookieJar }).json()

    const result = {
        specCount: specs.meta.count,
        runCounts: {},
        statusCounts: {},
        totalRunCount: 0,
        totalStatusCounts: {}
    }

    const specIds = specs.data.map(v => v.id)

    logger.trace({ specIds })

    const runs = await Promise.all(specIds.map(v => getAllRuns(config, v, config.pageSize)))

    for (let i = 0; i < specIds.length; i++) {
        result.totalRunCount += runs[i].meta.count
        result.runCounts[specIds[i]] = runs[i].meta.count

        if (!result.statusCounts[specIds[i]]) {
            result.statusCounts[specIds[i]] = {}
        }

        for (let j = 0; j < runs[i].data.length; j++) {
            if (!result.totalStatusCounts[runs[i].data[j].attributes.status]) {
                result.totalStatusCounts[runs[i].data[j].attributes.status] = 0
            }

            if (!result.statusCounts[specIds[i]][runs[i].data[j].attributes.status]) {
                result.statusCounts[specIds[i]][runs[i].data[j].attributes.status] = 0
            }

            result.totalStatusCounts[runs[i].data[j].attributes.status]++
            result.statusCounts[specIds[i]][runs[i].data[j].attributes.status]++

            if (runs[i].data[j].attributes.status != 'errored' && runs[i].data[j].attributes.status != 'completed' && (Date.now() - new Date(runs[i].data[j].attributes.createdAt).getTime()) > config.staleAge) {
                if (!result.totalStatusCounts['stale']) {
                    result.totalStatusCounts['stale'] = 0
                }

                if (!result.statusCounts[specIds[i]]['stale']) {
                    result.statusCounts[specIds[i]]['stale'] = 0
                }

                result.totalStatusCounts['stale']++
                result.statusCounts[specIds[i]]['stale']++
            }
        }
    }

    return result
}

exports.clAuthenticate = authenticate
exports.clBalances = getBalances
exports.clConfig = getConfig
exports.clRunStats = getRunStats
