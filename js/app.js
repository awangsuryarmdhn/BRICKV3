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
            btnConfirmLogin: document.getElementById('btn-confirm-login'),
            btnCancelLogin: document.getElementById('btn-cancel-login'),
            linkGenerate: document.getElementById('link-generate'),
            
            genResultArea: document.getElementById('gen-result-area'),
            displayNsec: document.getElementById('display-nsec'),
            btnCopyKey: document.getElementById('btn-copy-key'),
            btnDownloadKey: document.getElementById('btn-download-key'),

            messagesContainer: document.getElementById('messages-container'),
            messageInput: document.getElementById('message-input'),
            btnSend: document.getElementById('btn-send'),
            status: document.getElementById('connection-status'),
            userName: document.getElementById('user-name')
        };

        this.init();
    }

    async init() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('./sw.js');
            } catch (e) {
                console.warn('BrickChat: SW failed', e);
            }
        }

        this.setupEventListeners();
        this.checkExistingSession();
        
        if (window.NostrTools) {
            this.initialized = true;
        }
    }

    setupEventListeners() {
        this.elements.btnLogin.onclick = () => this.showModal(true);
        this.elements.btnCancelLogin.onclick = () => this.showModal(false);
        this.elements.btnConfirmLogin.onclick = () => this.handleLogin();
        
        this.elements.linkGenerate.onclick = (e) => {
            e.preventDefault();
            this.generateNewIdentity();
        };

        this.elements.btnCopyKey.onclick = () => this.copyToClipboard();
        this.elements.btnDownloadKey.onclick = () => this.downloadKeyFile();

        this.elements.btnSend.onclick = () => this.sendMessage();
        this.elements.messageInput.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        };
    }

    showModal(show) {
        this.elements.modalContainer.classList.toggle('hidden', !show);
        if (show) {
            this.elements.genResultArea.classList.add('hidden');
        }
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
        const key = this.elements.inputKey.value.trim();
        if (!key) {
            Swal.fire({
                icon: 'warning',
                title: 'Missing Key',
                text: 'Please enter your Secret Key to proceed.',
                confirmButtonColor: '#c0392b'
            });
            return;
        }

        try {
            let hexKey = key;
            if (key.startsWith('nsec')) {
                const { decode } = window.NostrTools.nip19;
                const { data } = decode(key);
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
            
            Swal.fire({
                icon: 'success',
                title: 'Welcome Back!',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Invalid Key',
                text: 'The format of the key is incorrect. Check nsec or hex code.',
                confirmButtonColor: '#c0392b'
            });
        }
    }

    generateNewIdentity() {
        const privkey = window.NostrTools.generateSecretKey();
        const nsec = window.NostrTools.nip19.nsecEncode(privkey);
        
        this.elements.displayNsec.innerText = nsec;
        this.elements.genResultArea.classList.remove('hidden');
        
        Swal.fire({
            icon: 'info',
            title: 'New Identity Created',
            text: 'Please backup your key immediately using the Copy or Download buttons.',
            confirmButtonColor: '#c0392b'
        });
    }

    async copyToClipboard() {
        const text = this.elements.displayNsec.innerText;
        try {
            await navigator.clipboard.writeText(text);
            Swal.fire({
                icon: 'success',
                title: 'Copied!',
                toast: true,
                position: 'top-end',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (e) {
            console.error('Copy failed', e);
        }
    }

    downloadKeyFile() {
        const text = this.elements.displayNsec.innerText;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'brick_secret_key.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        Swal.fire({
            icon: 'success',
            title: 'Downloaded!',
            text: 'Your key has been saved as brick_secret_key.txt',
            confirmButtonColor: '#c0392b'
        });
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
        this.pool.subscribeMany(this.relays, [
            {
                kinds: [1],
                limit: 50
            }
        ], {
            onevent: (event) => this.renderMessage(event),
            oneose: () => console.log('BrickChat: EOSE')
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
        } catch (e) {
            console.error('BrickChat: Publish failed', e);
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
