// js/services/crypto-apis.js - Multi-cryptocurrency API service

class CryptoAPI {
    constructor() {
        this.rateLimitQueue = new Map();
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 minute
    }

    static getAPI(cryptocurrency) {
        switch (cryptocurrency) {
            case 'bitcoin':
                return new BitcoinAPI();
            case 'ethereum':
                return new EthereumAPI();
            case 'litecoin':
                return new LitecoinAPI();
            default:
                throw new Error(`Unsupported cryptocurrency: ${cryptocurrency}`);
        }
    }

    async rateLimitedFetch(url, options = {}) {
        const now = Date.now();
        const lastRequest = this.rateLimitQueue.get(url) || 0;
        const timeSinceLastRequest = now - lastRequest;
        
        if (timeSinceLastRequest < CONFIG.settings.rateLimitDelay) {
            await new Promise(resolve => 
                setTimeout(resolve, CONFIG.settings.rateLimitDelay - timeSinceLastRequest)
            );
        }
        
        this.rateLimitQueue.set(url, Date.now());
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.settings.requestTimeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            clearTimeout(timeout);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            throw error;
        }
    }

    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCachedData(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    async getWithCache(url, key = url) {
        const cached = this.getCachedData(key);
        if (cached) return cached;
        
        const response = await this.rateLimitedFetch(url);
        const data = await response.json();
        
        this.setCachedData(key, data);
        return data;
    }
}

class BitcoinAPI extends CryptoAPI {
    constructor() {
        super();
        this.baseUrl = CONFIG.apis.bitcoin.base;
    }

    async getNetworkStats() {
        try {
            const height = await this.getWithCache(`${this.baseUrl}/blocks/tip/height`);
            const response = await this.rateLimitedFetch(`${this.baseUrl}/blocks/tip/height`);
            const heightText = await response.text();
            
            return {
                blockHeight: parseInt(heightText),
                hashRate: '755 EH/s', // This would need a different API
                difficulty: '84.38T'   // This would need a different API
            };
        } catch (error) {
            throw new Error(`Failed to fetch Bitcoin stats: ${error.message}`);
        }
    }

    async getPrice() {
        try {
            const data = await this.getWithCache(CONFIG.apis.bitcoin.price, 'bitcoin-price');
            return data.bitcoin?.usd;
        } catch (error) {
            console.warn('Failed to fetch Bitcoin price:', error);
            return null;
        }
    }

    async search(query) {
        query = query.trim();
        
        if (query === 'latest') {
            return await this.getLatestBlock();
        }
        
        if (query.length === 64 && /^[a-fA-F0-9]+$/.test(query)) {
            try {
                const block = await this.getBlock(query);
                return { ...block, type: 'block' };
            } catch {
                try {
                    const tx = await this.getTransaction(query);
                    return { ...tx, type: 'transaction' };
                } catch {
                    throw new Error('Hash not found in blockchain');
                }
            }
        }
        
        if (/^\d+$/.test(query)) {
            const height = parseInt(query);
            if (height < 0) throw new Error('Block height must be positive');
            
            const block = await this.getBlockByHeight(height);
            return { ...block, type: 'block' };
        }
        
        // Assume it's an address
        const address = await this.getAddress(query);
        return { ...address, type: 'address' };
    }

    async getLatestBlock() {
        const response = await this.rateLimitedFetch(`${this.baseUrl}/blocks/tip/hash`);
        const hash = await response.text();
        const block = await this.getBlock(hash);
        return { ...block, type: 'block' };
    }

    async getBlock(hash) {
        const block = await this.getWithCache(`${this.baseUrl}/block/${hash}`);
        
        try {
            const txs = await this.getWithCache(`${this.baseUrl}/block/${hash}/txs`);
            block.transactions = txs.slice(0, 10);
        } catch (error) {
            console.warn('Failed to fetch transactions for block:', error);
            block.transactions = [];
        }
        
        return block;
    }

    async getBlockByHeight(height) {
        const response = await this.rateLimitedFetch(`${this.baseUrl}/block-height/${height}`);
        const hash = await response.text();
        return await this.getBlock(hash);
    }

    async getTransaction(txid) {
        return await this.getWithCache(`${this.baseUrl}/tx/${txid}`);
    }

    async getAddress(address) {
        const addressData = await this.getWithCache(`${this.baseUrl}/address/${address}`);
        
        try {
            const txs = await this.getWithCache(`${this.baseUrl}/address/${address}/txs`);
            addressData.transactions = txs.slice(0, 10);
        } catch (error) {
            console.warn('Failed to fetch transactions for address:', error);
            addressData.transactions = [];
        }
        
        return addressData;
    }

    async getAddressActivity(address) {
        try {
            const txs = await this.getWithCache(`${this.baseUrl}/address/${address}/txs`);
            return txs.slice(0, 5); // Return recent 5 transactions
        } catch (error) {
            console.warn('Failed to fetch address activity:', error);
            return [];
        }
    }
}

class EthereumAPI extends CryptoAPI {
    constructor() {
        super();
        this.baseUrl = CONFIG.apis.ethereum.base;
        this.apiKey = CONFIG.apis.ethereum.apiKey;
    }

    async getNetworkStats() {
        try {
            const [blockNumber, gasPrice] = await Promise.all([
                this.etherscanRequest('proxy', 'eth_blockNumber'),
                this.etherscanRequest('proxy', 'eth_gasPrice')
            ]);

            return {
                blockHeight: parseInt(blockNumber.result, 16),
                gasPrice: parseInt(gasPrice.result, 16) / 1e9 + ' Gwei',
                hashRate: '~900 TH/s', // Approximate
                difficulty: 'N/A (PoS)'
            };
        } catch (error) {
            throw new Error(`Failed to fetch Ethereum stats: ${error.message}`);
        }
    }

    async getPrice() {
        try {
            const data = await this.getWithCache(CONFIG.apis.ethereum.price, 'ethereum-price');
            return data.ethereum?.usd;
        } catch (error) {
            console.warn('Failed to fetch Ethereum price:', error);
            return null;
        }
    }

    async etherscanRequest(module, action, params = {}) {
        const url = new URL(this.baseUrl);
        url.searchParams.set('module', module);
        url.searchParams.set('action', action);
        url.searchParams.set('apikey', this.apiKey);
        
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });

        const response = await this.rateLimitedFetch(url.toString());
        const data = await response.json();
        
        if (data.status !== '1') {
            throw new Error(data.message || 'Etherscan API error');
        }
        
        return data;
    }

    async search(query) {
        query = query.trim();
        
        if (query === 'latest') {
            const result = await this.etherscanRequest('proxy', 'eth_getBlockByNumber', {
                tag: 'latest',
                boolean: 'true'
            });
            return { ...result.result, type: 'block' };
        }
        
        if (query.length === 66 && query.startsWith('0x')) {
            // Could be transaction hash or block hash
            try {
                const tx = await this.etherscanRequest('proxy', 'eth_getTransactionByHash', {
                    txhash: query
                });
                if (tx.result) {
                    return { ...tx.result, type: 'transaction' };
                }
            } catch {}
            
            try {
                const block = await this.etherscanRequest('proxy', 'eth_getBlockByHash', {
                    blockhash: query,
                    boolean: 'true'
                });
                if (block.result) {
                    return { ...block.result, type: 'block' };
                }
            } catch {}
            
            throw new Error('Hash not found');
        }
        
        if (/^\d+$/.test(query)) {
            const blockNumber = '0x' + parseInt(query).toString(16);
            const result = await this.etherscanRequest('proxy', 'eth_getBlockByNumber', {
                tag: blockNumber,
                boolean: 'true'
            });
            return { ...result.result, type: 'block' };
        }
        
        if (query.length === 42 && query.startsWith('0x')) {
            const balance = await this.etherscanRequest('account', 'balance', {
                address: query
            });
            
            const txs = await this.etherscanRequest('account', 'txlist', {
                address: query,
                startblock: 0,
                endblock: 99999999,
                page: 1,
                offset: 10,
                sort: 'desc'
            });
            
            return {
                address: query,
                balance: balance.result,
                transactions: txs.result || [],
                type: 'address'
            };
        }
        
        throw new Error('Invalid Ethereum query format');
    }

    async getBlock(hash) {
        const result = await this.etherscanRequest('proxy', 'eth_getBlockByHash', {
            blockhash: hash,
            boolean: 'true'
        });
        return result.result;
    }

    async getTransaction(hash) {
        const result = await this.etherscanRequest('proxy', 'eth_getTransactionByHash', {
            txhash: hash
        });
        return result.result;
    }

    async getAddress(address) {
        const [balance, txs] = await Promise.all([
            this.etherscanRequest('account', 'balance', { address }),
            this.etherscanRequest('account', 'txlist', {
                address,
                startblock: 0,
                endblock: 99999999,
                page: 1,
                offset: 10,
                sort: 'desc'
            })
        ]);
        
        return {
            address,
            balance: balance.result,
            transactions: txs.result || []
        };
    }

    async getAddressActivity(address) {
        try {
            const result = await this.etherscanRequest('account', 'txlist', {
                address,
                startblock: 0,
                endblock: 99999999,
                page: 1,
                offset: 5,
                sort: 'desc'
            });
            return result.result || [];
        } catch (error) {
            console.warn('Failed to fetch Ethereum address activity:', error);
            return [];
        }
    }
}

class LitecoinAPI extends CryptoAPI {
    constructor() {
        super();
        this.baseUrl = CONFIG.apis.litecoin.base;
    }

    async getNetworkStats() {
        try {
            const stats = await this.getWithCache(`${this.baseUrl}/stats`);
            return {
                blockHeight: stats.data?.blocks,
                hashRate: stats.data?.hashrate_24h,
                difficulty: stats.data?.difficulty
            };
        } catch (error) {
            throw new Error(`Failed to fetch Litecoin stats: ${error.message}`);
        }
    }

    async getPrice() {
        try {
            const data = await this.getWithCache(CONFIG.apis.litecoin.price, 'litecoin-price');
            return data.litecoin?.usd;
        } catch (error) {
            console.warn('Failed to fetch Litecoin price:', error);
            return null;
        }
    }

    async search(query) {
        query = query.trim();
        
        if (query === 'latest') {
            const stats = await this.getWithCache(`${this.baseUrl}/stats`);
            const blockHeight = stats.data?.blocks;
            return await this.getBlockByHeight(blockHeight);
        }
        
        if (query.length === 64 && /^[a-fA-F0-9]+$/.test(query)) {
            try {
                const block = await this.getBlock(query);
                return { ...block, type: 'block' };
            } catch {
                try {
                    const tx = await this.getTransaction(query);
                    return { ...tx, type: 'transaction' };
                } catch {
                    throw new Error('Hash not found');
                }
            }
        }
        
        if (/^\d+$/.test(query)) {
            const height = parseInt(query);
            const block = await this.getBlockByHeight(height);
            return { ...block, type: 'block' };
        }
        
        // Litecoin address
        const address = await this.getAddress(query);
        return { ...address, type: 'address' };
    }

    async getBlock(hash) {
        return await this.getWithCache(`${this.baseUrl}/dashboards/block/${hash}`);
    }

    async getBlockByHeight(height) {
        return await this.getWithCache(`${this.baseUrl}/dashboards/block/${height}`);
    }

    async getTransaction(hash) {
        return await this.getWithCache(`${this.baseUrl}/dashboards/transaction/${hash}`);
    }

    async getAddress(address) {
        return await this.getWithCache(`${this.baseUrl}/dashboards/address/${address}`);
    }

    async getAddressActivity(address) {
        try {
            const data = await this.getWithCache(`${this.baseUrl}/dashboards/address/${address}`);
            return data.data?.transactions?.slice(0, 5) || [];
        } catch (error) {
            console.warn('Failed to fetch Litecoin address activity:', error);
            return [];
        }
    }
}

// Rate limiting utility
class RateLimiter {
    constructor(maxRequests = 10, timeWindow = 60000) {
        this.requests = [];
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
    }

    async checkLimit() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.timeWindow);
        
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.timeWindow - (now - oldestRequest);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.checkLimit();
        }
        
        this.requests.push(now);
        return true;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CryptoAPI, BitcoinAPI, EthereumAPI, LitecoinAPI };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.CryptoAPI = CryptoAPI;
}