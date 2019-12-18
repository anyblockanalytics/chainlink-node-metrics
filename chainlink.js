const got = require('got')
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

exports.clAuthenticate = authenticate
exports.clBalances = getBalances
exports.clConfig = getConfig
