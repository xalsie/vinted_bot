import axios from 'axios'
import UserAgent from 'user-agents'
import cookie from 'cookie'
import HttpsProxyAgent  from 'https-proxy-agent'

const cookies = new Map();

/**
 * Fetches a new public cookie from Vinted.fr
 */
const fetchCookie = (domain = 'fr') => {
    return new Promise((resolve, reject) => {
        const controller = new AbortController()
        const agent = process.env.VINTED_API_HTTPS_PROXY ? new HttpsProxyAgent(process.env.VINTED_API_HTTPS_PROXY) : undefined;
        if (agent) {
            console.log(`🌍 Using proxy ${process.env.VINTED_API_HTTPS_PROXY}`)
        }
        console.time("timeOutVinted")
        axios.get(`https://vinted.${domain}`, {
            signal: controller.signal,
            agent,
            withCredentials: true,
            headers: {
                'user-agent': new UserAgent().toString()
            }
          }).then((res) => {
            const c = cookie.parse(JSON.stringify(res.headers.get('set-cookie')))['secure","_vinted_fr_session']
            controller.abort()
            if (c) {
                console.log("🍪", c)
                cookies.set(domain, c)
            }
            resolve();
        }).catch((e) => {
            controller.abort()
            console.log("ERROR, Vinted did not respond to the request", e)
            fetchCookie()
            // reject();
        })
        console.timeEnd("timeOutVinted")
    })
}

/**
 * Parse a vinted URL to get the querystring usable in the search endpoint
 */
const parseVintedURL = (url, disableOrder = false, allowSwap = false, customParams = {}) => {
    try {
        const decodedURL = decodeURI(url)
        const matchedParams = decodedURL.match(/^https:\/\/www\.vinted\.([a-z]+)/)
        if (!matchedParams) return {
            validURL: false
        };

        const missingIDsParams = ['catalog', 'status'];
        const params = decodedURL.match(/(?:([a-z_]+)(\[\])?=([a-zA-Z 0-9._À-ú+%]*)&?)/g)
        if (typeof matchedParams[Symbol.iterator] !== 'function') return {
            validURL: false
        };

        const mappedParams = new Map()
        for (let param of params) {
            let [ _, paramName, isArray, paramValue ] = param.match(/(?:([a-z_]+)(\[\])?=([a-zA-Z 0-9._À-ú+%]*)&?)/);
            if (paramValue?.includes(' ')) paramValue = paramValue.replace(/ /g, '+')
            if (isArray) {
                if (missingIDsParams.includes(paramName)) paramName = `${paramName}_id`;
                if (mappedParams.has(`${paramName}s`)) {
                    mappedParams.set(`${paramName}s`, [ ...mappedParams.get(`${paramName}s`), paramValue ])
                } else {
                    mappedParams.set(`${paramName}s`, [paramValue])
                }
            } else {
                mappedParams.set(paramName, paramValue)
            }
        }
        for (let key of Object.keys(customParams)) {
            mappedParams.set(key, customParams[key])
        }
        const finalParams = [];
        for (let [ key, value ] of mappedParams.entries()) {
            finalParams.push(typeof value === 'string' ? `${key}=${value}` : `${key}=${value.join(',')}`)
        }

        return {
            validURL: true,
            domain: matchedParams[1],
            querystring: finalParams.join('&')
        }
    } catch (e) {
        return {
            validURL: false
        }
    }
}

/**
 * Searches something on Vinted
 */
const search = (url, disableOrder = false, allowSwap = false, customParams = {}) => {
    return new Promise(async (resolve, reject) => {
        const { validURL, domain, querystring } = parseVintedURL(url, disableOrder ?? false, allowSwap ?? false, customParams)

        if (!validURL) {
            console.log(`❗️ ${url} is not valid in search!`)
            return resolve([])
        }

        var c = process.env[`VINTED_API_${domain.toUpperCase()}_COOKIE`] ?? cookies.get(domain);
        if (c) console.log(`    - 💾 Using cached cookie for ${domain}`)
        if (!c) {
            console.log(`   - 🍪 Fetching cookie for ${domain}`)
            await fetchCookie(domain).catch(() => {})
            c = process.env[`VINTED_API_${domain.toUpperCase()}_COOKIE`] ?? cookies.get(domain);
        }

        const controller = new AbortController()
        axios.get(`https://www.vinted.${domain}/api/v2/catalog/items?${querystring}`, {
            signal: controller.signal,
            //agent: process.env.VINTED_API_HTTPS_PROXY ? new HttpsProxyAgent(process.env.VINTED_API_HTTPS_PROXY) : undefined,
            withCredentials: true,
            headers: {
                cookie: '_vinted_fr_session=' + c,
                'user-agent': new UserAgent().toString(),
                accept: 'application/json, text/plain, */*'
            },
            timeout: (30 * 1000),
        }).then((res) => {
            controller.abort()
            try {
                resolve(res.data)
            } catch (e) {
                reject(res)
            }
        }).catch((err) => {
            try {
                if (err.response.data.message == "Token d'authentification invalide") {
                    console.log(`🍪 Fetching a new cookie for ${domain}`)
                    fetchCookie();
                }
            } catch {}
            controller.abort()
            reject('❌ Can not fetch search API', err)
        })
    });
}

/**
 * Get all the information about a product on vinted
 */
const getDetailItem = (id) => {
    return new Promise(async (resolve, reject) => {
        const domain = "fr";

        var c = process.env[`VINTED_API_${domain.toUpperCase()}_COOKIE`] ?? cookies.get(domain);
        if (c) console.log(`    - 💾 Using cached cookie for ${domain}`)
        if (!c) {
            console.log(`   - 🍪 Fetching cookie for ${domain}`)
            await fetchCookie(domain).catch(() => {})
            c = process.env[`VINTED_API_${domain.toUpperCase()}_COOKIE`] ?? cookies.get(domain);
        }

        const controller = new AbortController()
        axios.get(`https://www.vinted.${domain}/api/v2/items/${id}`, {
            signal: controller.signal,
            //agent: process.env.VINTED_API_HTTPS_PROXY ? new HttpsProxyAgent(process.env.VINTED_API_HTTPS_PROXY) : undefined,
            withCredentials: true,
            headers: {
                cookie: '_vinted_fr_session=' + c,
                'user-agent': new UserAgent().toString(),
                accept: 'application/json, text/plain, */*'
            }
        }).then((res) => {
            controller.abort()
            try {
                resolve(res.data)
            } catch (e) {
                reject(res)
            }
        }).catch((err) => {
            try {
                if (err.data.message === `Token d'authentification invalide`) {
                    console.log(`🍪 Fetching a new cookie for ${domain}`)
                    fetchCookie()
                }
            } catch {}
            controller.abort()
            reject('❌ Can not fetch detail item API', err)
        })
    })
}

export {
    fetchCookie,
    parseVintedURL,
    search,
    getDetailItem
}