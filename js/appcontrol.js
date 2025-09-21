// js/main.js - Main application controller

class CryptoExplorer {
    constructor() {
        this.currentCrypto = CONFIG.settings.defaultCrypto;
        this.currentUser = null;
        this.isSearching = false;
        this.autoRefreshInterval = null;
        this.recentSearches = [];
        this.following = [];
        this.watchlist = [];
        
        this.initializeApp();
    }

    async initializeApp() {
        try {
            // Initialize components
            this.initializeTheme();
            this.initializeEventListeners();
            this.initializeAuth();
            
            // Load initial data
            await this.loadStats();
            await this.loadUserData();
            
            // Load recent searches from storage
            this.loadRecentSearches();
            
            // Show success message
            UI.showToast('CryptoExplorer loaded successfully!', 'success');
            
        } catch (error) {
            console.error('App initialization error:', error);
            UI.showToast('Failed to initialize application', 'error');
        }
    }

    initializeTheme() {
        const savedTheme = Storage.get('theme', CONFIG.settings.defaultTheme);
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        Storage.set('theme', theme);
        
        const toggle = document.getElementById('themeToggle');
        const icon = document.getElementById('themeIcon');
        
        if (theme === 'light') {
            toggle.classList.add('active');
            icon.textContent = '☀️';
        } else {
            toggle.classList.remove('active');
            icon.textContent = '🌙';
        }
    }

    initializeEventListeners() {
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            const current = document.body.getAttribute('data-theme');
            this.setTheme(current === 'dark' ? 'light' : 'dark');
        });

        // Cryptocurrency selector
        document.querySelectorAll('.crypto-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const crypto = e.currentTarget.dataset.crypto;
                this.switchCrypto(crypto);
            });
        });

        // Settings dropdown
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsDropdown = document.getElementById('settings');
        
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsDropdown.classList.toggle('show');
        });

        // Auto-refresh toggle
        const autoToggle = document.getElementById('autoToggle');
        autoToggle.addEventListener('click', () => {
            autoToggle.classList.toggle('active');
            
            if (autoToggle.classList.contains('active')) {
                this.autoRefreshInterval = setInterval(() => {
                    this.loadStats();
                }, CONFIG.settings.autoRefreshInterval);
            } else if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
            }
        });

        // Notifications toggle
        const notifToggle = document.getElementById('notifToggle');
        notifToggle.addEventListener('click', () => {
            notifToggle.classList.toggle('active');
            
            if (notifToggle.classList.contains('active') && 'Notification' in window) {
                Notification.requestPermission();
            }
        });

        // Page navigation
        document.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.currentTarget.dataset.page;
                this.navigateToPage(page);
            });
        });

        // Search functionality
        const searchForm = document.getElementById('searchForm');
        const searchInput = document.getElementById('searchInput');
        
        searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.isSearching && searchInput.value.trim()) {
                await this.performSearch(searchInput.value.trim());
            }
        });

        // Example queries
        document.querySelectorAll('.example-tag').forEach(tag => {
            tag.addEventListener('click', async (e) => {
                const query = e.target.dataset.query;
                searchInput.value = query;
                await this.performSearch(query);
            });
        });

        // QR Scanner
        const qrBtn = document.getElementById('qrScanBtn');
        qrBtn.addEventListener('click', () => {
            this.startQRScanner();
        });

        // Mobile menu
        const mobileBtn = document.getElementById('mobileBtn');
        const nav = document.getElementById('nav');
        
        mobileBtn.addEventListener('click', () => {
            nav.classList.toggle('show');
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!settingsBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
                settingsDropdown.classList.remove('show');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                searchInput.focus();
            }
            
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.toggleTheme();
            }
        });
    }

    initializeAuth() {
        // Initialize authentication system
        Auth.initialize();
        
        // Sign in button
        document.getElementById('signInBtn').addEventListener('click', () => {
            AuthUI.showModal();
        });

        // Authentication events
        document.addEventListener('auth:signedIn', (e) => {
            this.currentUser = e.detail.user;
            this.updateUserUI();
            this.loadUserData();
        });

        document.addEventListener('auth:signedOut', () => {
            this.currentUser = null;
            this.updateUserUI();
            this.clearUserData();
        });
    }

    updateUserUI() {
        const signInBtn = document.getElementById('signInBtn');
        const userProfile = document.getElementById('userProfile');
        
        if (this.currentUser) {
            signInBtn.style.display = 'none';
            userProfile.style.display = 'block';
            
            const avatar = document.getElementById('userAvatar');
            const username = document.getElementById('username');
            
            avatar.src = this.currentUser.photoURL || `https://ui-avatars.com/api/?name=${this.currentUser.displayName}&background=6366f1&color=fff`;
            username.textContent = this.currentUser.displayName || this.currentUser.email;
        } else {
            signInBtn.style.display = 'block';
            userProfile.style.display = 'none';
        }
    }

    async switchCrypto(crypto) {
        if (crypto === this.currentCrypto) return;
        
        this.currentCrypto = crypto;
        document.body.setAttribute('data-crypto', crypto);
        
        // Update active button
        document.querySelectorAll('.crypto-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.crypto === crypto);
        });
        
        // Update header
        const config = CONFIG.cryptocurrencies[crypto];
        document.getElementById('cryptoTitle').textContent = `${config.name} Blockchain Explorer`;
        document.getElementById('cryptoSubtitle').textContent = 
            `Explore blocks, transactions, and addresses on the ${config.name} network`;
        
        // Reload stats
        await this.loadStats();
        
        // Clear results
        document.getElementById('results').style.display = 'none';
        
        UI.showToast(`Switched to ${config.name}`, 'info');
    }

    async loadStats() {
        try {
            const api = CryptoAPI.getAPI(this.currentCrypto);
            const [stats, price] = await Promise.all([
                api.getNetworkStats(),
                api.getPrice()
            ]);
            
            this.updateStatsDisplay(stats, price);
            
        } catch (error) {
            console.error('Error loading stats:', error);
            UI.showToast('Failed to load network statistics', 'error');
        }
    }

    updateStatsDisplay(stats, price) {
        const formatters = {
            blockHeight: (value) => value?.toLocaleString() || '-',
            price: (value) => value ? `${value.toLocaleString()}` : '-',
            hashRate: (value) => value || '-',
            difficulty: (value) => value || '-'
        };

        document.getElementById('blockHeight').textContent = formatters.blockHeight(stats.blockHeight);
        document.getElementById('price').textContent = formatters.price(price);
        document.getElementById('hashRate').textContent = formatters.hashRate(stats.hashRate);
        document.getElementById('difficulty').textContent = formatters.difficulty(stats.difficulty);
    }

    async performSearch(query) {
        if (this.isSearching) return;
        
        this.isSearching = true;
        const resultsContainer = document.getElementById('results');
        const resultsContent = document.getElementById('resultsContent');
        const searchBtn = document.getElementById('searchBtn');
        const btnText = document.getElementById('btnText');
        
        // Show loading state
        resultsContainer.style.display = 'block';
        searchBtn.disabled = true;
        btnText.textContent = 'Searching...';
        resultsContent.innerHTML = '<div class="loading"><div class="spinner"></div><p>Searching blockchain...</p></div>';
        
        try {
            const api = CryptoAPI.getAPI(this.currentCrypto);
            const data = await api.search(query);
            
            this.displayResults(data);
            this.addToRecentSearches(query);
            
        } catch (error) {
            console.error('Search error:', error);
            this.displayError(error.message);
        } finally {
            this.isSearching = false;
            searchBtn.disabled = false;
            btnText.textContent = 'Search';
        }
    }

    displayResults(data) {
        const resultsTitle = document.getElementById('resultsTitle');
        const resultsContent = document.getElementById('resultsContent');
        const followBtn = document.getElementById('followBtn');
        
        // Update header based on data type
        if (data.type === 'block') {
            resultsTitle.innerHTML = `Block #${data.height?.toLocaleString()} <span class="badge success">Confirmed</span>`;
            followBtn.style.display = 'none';
        } else if (data.type === 'transaction') {
            const status = data.status?.confirmed ? 'Confirmed' : 'Unconfirmed';
            const badgeClass = data.status?.confirmed ? 'success' : 'warning';
            resultsTitle.innerHTML = `Transaction <span class="badge ${badgeClass}">${status}</span>`;
            followBtn.style.display = 'none';
        } else if (data.type === 'address') {
            resultsTitle.innerHTML = `Address <span class="badge">Active</span>`;
            followBtn.style.display = this.currentUser ? 'block' : 'none';
            followBtn.textContent = this.isFollowing(data.address) ? 'Unfollow' : 'Follow';
        }
        
        // Generate content based on type
        resultsContent.innerHTML = SearchUI.generateResultsHTML(data, this.currentCrypto);
        
        // Update follow button handler
        followBtn.onclick = () => this.toggleFollow(data.address);
    }

    displayError(message) {
        const resultsContent = document.getElementById('resultsContent');
        resultsContent.innerHTML = `
            <div class="error">
                <strong>Search Error</strong><br>
                ${message}<br><br>
                <small>Please check your input and try again.</small>
            </div>
        `;
    }

    addToRecentSearches(query) {
        this.recentSearches = this.recentSearches.filter(q => q !== query);
        this.recentSearches.unshift(query);
        this.recentSearches = this.recentSearches.slice(0, CONFIG.settings.maxRecentSearches);
        
        Storage.set('recentSearches', this.recentSearches);
        this.updateRecentSearchesUI();
    }

    loadRecentSearches() {
        this.recentSearches = Storage.get('recentSearches', []);
        this.updateRecentSearchesUI();
    }

    updateRecentSearchesUI() {
        const container = document.getElementById('recentSearches');
        const list = document.getElementById('recentList');
        
        if (this.recentSearches.length > 0) {
            container.style.display = 'block';
            list.innerHTML = this.recentSearches.map(query => 
                `<span class="recent-item" onclick="app.performSearch('${query}')">${query}</span>`
            ).join('');
        } else {
            container.style.display = 'none';
        }
    }

    async loadUserData() {
        if (!this.currentUser) return;
        
        try {
            const userData = await API.getUserData(this.currentUser.uid);
            this.following = userData.following || [];
            this.watchlist = userData.watchlist || [];
            
            this.updateFollowingUI();
            this.updateWatchlistUI();
            
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    clearUserData() {
        this.following = [];
        this.watchlist = [];
        this.updateFollowingUI();
        this.updateWatchlistUI();
    }

    navigateToPage(pageName) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // Show selected page
        document.getElementById(`${pageName}Page`).classList.add('active');
        
        // Update navigation
        document.querySelectorAll('[data-page]').forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageName);
        });
        
        // Load page-specific data
        if (pageName === 'following') {
            this.loadFollowingPage();
        } else if (pageName === 'watchlist') {
            this.loadWatchlistPage();
        }
    }

    async startQRScanner() {
        try {
            if (!('mediaDevices' in navigator)) {
                throw new Error('Camera not supported');
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            // QR scanning implementation would go here
            UI.showToast('QR Scanner started', 'info');
            
        } catch (error) {
            UI.showToast('Camera access denied', 'error');
        }
    }

    toggleFollow(address) {
        if (!this.currentUser) {
            AuthUI.showModal();
            return;
        }
        
        const isCurrentlyFollowing = this.isFollowing(address);
        
        if (isCurrentlyFollowing) {
            this.unfollowAddress(address);
        } else {
            this.followAddress(address);
        }
    }

    followAddress(address) {
        if (this.following.length >= CONFIG.settings.maxFollowing) {
            UI.showToast('Maximum following limit reached', 'warning');
            return;
        }
        
        this.following.push({
            address,
            crypto: this.currentCrypto,
            addedAt: Date.now()
        });
        
        this.saveUserData();
        this.updateFollowingUI();
        
        const followBtn = document.getElementById('followBtn');
        followBtn.textContent = 'Unfollow';
        
        UI.showToast(CONFIG.messages.following, 'success');
    }

    unfollowAddress(address) {
        this.following = this.following.filter(item => item.address !== address);
        
        this.saveUserData();
        this.updateFollowingUI();
        
        const followBtn = document.getElementById('followBtn');
        followBtn.textContent = 'Follow';
        
        UI.showToast(CONFIG.messages.unfollowing, 'info');
    }

    isFollowing(address) {
        return this.following.some(item => item.address === address && item.crypto === this.currentCrypto);
    }

    async saveUserData() {
        if (!this.currentUser) return;
        
        try {
            await API.saveUserData(this.currentUser.uid, {
                following: this.following,
                watchlist: this.watchlist
            });
        } catch (error) {
            console.error('Error saving user data:', error);
            UI.showToast('Failed to save changes', 'error');
        }
    }

    updateFollowingUI() {
        const container = document.getElementById('followingList');
        
        if (this.following.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <h3>No addresses followed yet</h3>
                    <p>Start following addresses to track their activity here</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.following.map(item => 
            FollowingUI.generateFollowingItem(item)
        ).join('');
    }

    updateWatchlistUI() {
        const container = document.getElementById('watchlistGrid');
        
        if (this.watchlist.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⭐</div>
                    <h3>No items in watchlist</h3>
                    <p>Add blocks and transactions to your watchlist for easy access</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.watchlist.map(item => 
            WatchlistUI.generateWatchlistItem(item)
        ).join('');
    }

    loadFollowingPage() {
        // Load activity for followed addresses
        this.following.forEach(async (item) => {
            try {
                const api = CryptoAPI.getAPI(item.crypto);
                const activity = await api.getAddressActivity(item.address);
                // Update UI with activity
            } catch (error) {
                console.error('Error loading following activity:', error);
            }
        });
    }

    loadWatchlistPage() {
        // Load details for watchlisted items
        this.watchlist.forEach(async (item) => {
            try {
                const api = CryptoAPI.getAPI(item.crypto);
                const details = item.type === 'block' 
                    ? await api.getBlock(item.id)
                    : await api.getTransaction(item.id);
                // Update UI with details
            } catch (error) {
                console.error('Error loading watchlist details:', error);
            }
        });
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CryptoExplorer();
});

// Service worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('SW registered:', registration))
            .catch(error => console.log('SW registration failed:', error));
    });
}