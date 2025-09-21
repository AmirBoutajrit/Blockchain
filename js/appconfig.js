// js/config.js - Application configuration

const CONFIG = {
    // API Endpoints
    apis: {
        bitcoin: {
            base: 'https://blockstream.info/api',
            price: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
        },
        ethereum: {
            base: 'https://api.etherscan.io/api',
            apiKey: 'YourEtherscanAPIKey', // Replace with actual API key
            price: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        },
        litecoin: {
            base: 'https://api.blockchair.com/litecoin',
            price: 'https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd'
        }
    },

    // Backend API (replace with your deployed backend URL)
    backendUrl: process.env.NODE_ENV === 'production' 
        ? 'https://your-backend-domain.com/api'
        : 'http://localhost:3001/api',

    // Firebase configuration (replace with your Firebase config)
    firebase: {
        apiKey: "your-api-key",
        authDomain: "your-project.firebaseapp.com",
        projectId: "your-project-id",
        storageBucket: "your-project.appspot.com",
        messagingSenderId: "123456789",
        appId: "your-app-id"
    },

    // Application settings
    settings: {
        defaultTheme: 'dark',
        defaultCrypto: 'bitcoin',
        autoRefreshInterval: 30000, // 30 seconds
        maxRecentSearches: 10,
        maxFollowing: 100,
        maxWatchlist: 50,
        requestTimeout: 10000, // 10 seconds
        rateLimitDelay: 1000 // 1 second between requests
    },

    // Supported cryptocurrencies
    cryptocurrencies: {
        bitcoin: {
            name: 'Bitcoin',
            symbol: 'BTC',
            icon: '₿',
            decimals: 8,
            blockTime: 600, // 10 minutes
            confirmations: 6
        },
        ethereum: {
            name: 'Ethereum',
            symbol: 'ETH',
            icon: 'Ξ',
            decimals: 18,
            blockTime: 12, // 12 seconds
            confirmations: 12
        },
        litecoin: {
            name: 'Litecoin',
            symbol: 'LTC',
            icon: 'Ł',
            decimals: 8,
            blockTime: 150, // 2.5 minutes
            confirmations: 6
        }
    },

    // UI Constants
    ui: {
        toastDuration: 5000,
        animationDuration: 300,
        debounceDelay: 500,
        loadingTimeout: 30000
    },

    // Error messages
    errors: {
        network: 'Network error. Please check your connection.',
        notFound: 'Requested data not found.',
        rateLimit: 'Too many requests. Please wait a moment.',
        validation: 'Invalid input. Please check your data.',
        auth: 'Authentication required. Please sign in.',
        unknown: 'An unexpected error occurred.'
    },

    // Success messages
    messages: {
        copied: 'Copied to clipboard!',
        saved: 'Saved successfully!',
        following: 'Now following this address',
        unfollowing: 'Unfollowed address',
        watchlisted: 'Added to watchlist',
        unwatchlisted: 'Removed from watchlist'
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}