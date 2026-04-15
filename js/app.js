// BRICKCHAT Core Logic
// Using nostr-tools via CDN

const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
];

class BrickChat {
    constructor() {
        this.pool = null;
        this.pubkey = null;
        this.privkey = null;
        this.relays = RELAYS;
        this.initialized = false;
        
        this.elements = {
            btnLogin: document.getElementById('btn-login'),
            modalContainer: document.getElementById('modal-container'),
            inputKey: document.getElementById('input-key'),
            inputEmail: document.getElementById('input-email'),
            inputPassword: document.getElementById('input-password'),
            tabKey: document.getElementById('tab-key'),
            tabEmail: document.getElementById('tab-email'),
            sectionKey: document.getElementById('section-key'),
            sectionEmail: document.getElementById('section-email'),
            btnConfirmLogin: document.getElementById('btn-confirm-login'),
            btnCancelLogin: document.getElementById('btn-cancel-login'),
            linkGenerate: document.getElementById('link-generate'),
            messagesContainer: document.getElementById('messages-container'),
            messageInput: document.getElementById('message-input'),
            btnSend: document.getElementById('btn-send'),
            status: document.getElementById('connection-status'),
            userName: document.getElementById('user-name')
        };

        this.authMode = 'key'; // 'key' or 'email'
        this.init();
    }

    async init() {
        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.register('./sw.js');
                console.log('BrickChat: Service Worker registered', reg);
            } catch (e) {
                console.warn('BrickChat: Service Worker registration failed', e);
            }
        }

        this.setupEventListeners();
        this.checkExistingSession();
        
        // Load NostrTools from window
        if (window.NostrTools) {
            this.initialized = true;
            console.log('BrickChat: NostrTools loaded');
        } else {
            console.error('BrickChat: NostrTools failed to load');
        }
    }

    setupEventListeners() {
        this.elements.btnLogin.onclick = () => this.showModal(true);
        this.elements.btnCancelLogin.onclick = () => this.showModal(false);
        this.elements.btnConfirmLogin.onclick = () => this.handleLogin();
        
        this.elements.tabKey.onclick = () => this.switchAuthMode('key');
        this.elements.tabEmail.onclick = () => this.switchAuthMode('email');

        this.elements.linkGenerate.onclick = (e) => {
            e.preventDefault();
            this.generateNewIdentity();
        };
        this.elements.btnSend.onclick = () => this.sendMessage();
        this.elements.messageInput.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        };
    }

    switchAuthMode(mode) {
        this.authMode = mode;
        this.elements.tabKey.classList.toggle('active', mode === 'key');
        this.elements.tabEmail.classList.toggle('active', mode === 'email');
        this.elements.sectionKey.classList.toggle('hidden', mode !== 'key');
        this.elements.sectionEmail.classList.toggle('hidden', mode !== 'email');
    }

    showModal(show) {
        this.elements.modalContainer.classList.toggle('hidden', !show);
    }

    checkExistingSession() {
        const stored = localStorage.getItem('brick_user');
        if (stored) {
            const user = JSON.parse(stored);
            this.pubkey = user.pubkey;
            this.privkey = user.privkey;
            this.onAuthenticated();
        }
    }

    async handleLogin() {
        if (this.authMode === 'key') {
            await this.handleKeyLogin();
        } else {
            await this.handleEmailLogin();
        }
    }

    async handleKeyLogin() {
        const key = this.elements.inputKey.value.trim();
        if (!key) return;
        this.authenticate(key);
    }

    async handleEmailLogin() {
        const email = this.elements.inputEmail.value.trim();
        const password = this.elements.inputPassword.value.trim();
        if (!email || !password) return;

        // Simple Brainwallet derivation: sha256(email + password)
        const encoder = new TextEncoder();
        const data = encoder.encode(email + password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hexKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        this.authenticate(hexKey);
    }

    async authenticate(hexOrNsec) {
        try {
            let hexKey = hexOrNsec;
            if (hexOrNsec.startsWith('nsec')) {
                const { decode } = window.NostrTools.nip19;
                const { data } = decode(hexOrNsec);
                hexKey = window.NostrTools.bytesToHex(data);
            }

            const pubkey = window.NostrTools.getPublicKey(window.NostrTools.hexToBytes(hexKey));
            
            this.pubkey = pubkey;
            this.privkey = hexKey;
            
            localStorage.setItem('brick_user', JSON.stringify({
                pubkey: this.pubkey,
                privkey: this.privkey
            }));

            this.showModal(false);
            this.onAuthenticated();
        } catch (e) {
            alert('Authentication Failed: ' + e.message);
        }
    }

    generateNewIdentity() {
        const privkey = window.NostrTools.generateSecretKey();
        const nsec = window.NostrTools.nip19.nsecEncode(privkey);
        this.elements.inputKey.value = nsec;
        alert('New Identity Generated! PLEASE BACKUP YOUR KEY:\n\n' + nsec);
    }

    async onAuthenticated() {
        this.elements.btnLogin.style.display = 'none';
        this.elements.messageInput.disabled = false;
        this.elements.btnSend.disabled = false;
        this.elements.userName.innerText = this.pubkey.substring(0, 8) + '...';
        
        this.connectToRelays();
    }

    async connectToRelays() {
        this.elements.status.innerText = 'Connecting...';
        this.elements.status.className = 'status-offline';

        const { SimplePool } = window.NostrTools;
        this.pool = new SimplePool();

        this.subscribeToMessages();
        
        this.elements.status.innerText = 'Online';
        this.elements.status.className = 'status-online';
    }

    subscribeToMessages() {
        const sub = this.pool.subscribeMany(this.relays, [
            {
                kinds: [1],
                limit: 50
            }
        ], {
            onevent: (event) => this.renderMessage(event),
            oneose: () => console.log('BrickChat: EOSE reached')
        });
    }

    renderMessage(event) {
        const isMe = event.pubkey === this.pubkey;
        const msgDiv = document.createElement('div');
        msgDiv.className = `message-brick ${isMe ? 'message-sent' : 'message-received'}`;
        
        const timestamp = new Date(event.created_at * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        msgDiv.innerHTML = `
            <div class="message-meta">${event.pubkey.substring(0, 8)} • ${timestamp}</div>
            <div class="message-content">${this.escapeHtml(event.content)}</div>
        `;

        this.elements.messagesContainer.appendChild(msgDiv);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }

    async sendMessage() {
        const content = this.elements.messageInput.value.trim();
        if (!content || !this.privkey) return;

        const event = {
            kind: 1,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: content,
            pubkey: this.pubkey
        };

        const signedEvent = window.NostrTools.finalizeEvent(event, window.NostrTools.hexToBytes(this.privkey));
        
        this.elements.messageInput.value = '';
        
        try {
            await Promise.any(this.pool.publish(this.relays, signedEvent));
            console.log('BrickChat: Message published');
        } catch (e) {
            console.error('BrickChat: Failed to publish', e);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
    window.brickChat = new BrickChat();
});
