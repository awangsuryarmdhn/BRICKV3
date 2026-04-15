// BRICKCHAT Pro - Logic
// Powered by Nostr-tools & DaisyUI

const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://relay.snort.social',
    'wss://eden.nostr.land',
    'wss://relay.current.fyi',
    'wss://brb.io',
    'wss://nostr.mom'
];

class BrickChat {
    constructor() {
        this.pool = null;
        this.pubkey = null;
        this.privkey = null;
        this.relays = RELAYS;
        this.connectedRelays = new Set();
        
        this.elements = {
            btnLogin: document.getElementById('btn-login'),
            loginModal: document.getElementById('login-modal'),
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
            userName: document.getElementById('user-name'),
            avatarInitial: document.getElementById('avatar-initial'),
            drawerToggle: document.getElementById('sidebar-drawer')
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        
        // Wait for NostrTools
        if (window.NostrTools) {
            console.log('BrickChat: NostrTools Version Check', window.NostrTools);
            this.checkExistingSession();
            
            // Connect as guest if no session
            if (!this.pubkey) {
                console.log('BrickChat: Connecting as Guest');
                this.connectToRelays();
            }
        } else {
            Swal.fire('Error', 'Library NostrTools gagal dimuat.', 'error');
        }
    }

    setupEventListeners() {
        this.elements.btnLogin.onclick = () => this.elements.loginModal.showModal();
        this.elements.btnCancelLogin.onclick = () => this.elements.loginModal.close();
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

    checkExistingSession() {
        const stored = localStorage.getItem('brick_user');
        if (stored) {
            try {
                const user = JSON.parse(stored);
                this.pubkey = user.pubkey;
                this.privkey = user.privkey;
                this.onAuthenticated();
            } catch (e) {
                localStorage.removeItem('brick_user');
            }
        }
    }

    async handleLogin() {
        const rawKey = this.elements.inputKey.value.trim();
        if (!rawKey) return;

        try {
            const hexKey = this.normalizeKey(rawKey);
            const pubkey = window.NostrTools.getPublicKey(window.NostrTools.hexToBytes(hexKey));
            
            this.pubkey = pubkey;
            this.privkey = hexKey;
            
            localStorage.setItem('brick_user', JSON.stringify({
                pubkey: this.pubkey,
                privkey: this.privkey
            }));

            this.elements.loginModal.close();
            this.onAuthenticated();
            
            Swal.fire({ icon: 'success', title: 'Connected', timer: 1500, showConfirmButton: false });
        } catch (e) {
            console.error('Login Error:', e);
            Swal.fire({
                icon: 'error',
                title: 'Invalid Key Format',
                text: 'Kunci gagal diproses. Pastikan format nsec atau hex benar.',
                confirmButtonColor: '#c0392b'
            });
        }
    }

    normalizeKey(key) {
        key = key.trim();
        
        // Handle nsec
        if (key.startsWith('nsec1')) {
            const { decode } = window.NostrTools.nip19;
            const decoded = decode(key);
            
            // nostr-tools v2.23+ returns hex string in .data, older returns Uint8Array
            if (typeof decoded.data === 'string') {
                return decoded.data;
            } else if (decoded.data instanceof Uint8Array) {
                return window.NostrTools.bytesToHex(decoded.data);
            }
        }
        
        // Handle Hex (validate length 64)
        if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
            return key.toLowerCase();
        }

        throw new Error('Unrecognized key format');
    }

    generateNewIdentity() {
        const privkey = window.NostrTools.generateSecretKey();
        const nsec = window.NostrTools.nip19.nsecEncode(privkey);
        
        this.elements.displayNsec.innerText = nsec;
        this.elements.genResultArea.classList.remove('hidden');
    }

    async copyToClipboard() {
        const text = this.elements.displayNsec.innerText;
        try {
            await navigator.clipboard.writeText(text);
            Swal.fire({ icon: 'success', title: 'Copied', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        } catch (e) { console.error(e); }
    }

    downloadKeyFile() {
        const text = this.elements.displayNsec.innerText;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'brick_secret_key.txt';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); 
    }

    async onAuthenticated() {
        this.elements.btnLogin.classList.add('hidden');
        this.elements.messageInput.disabled = false;
        this.elements.btnSend.disabled = false;
        
        this.elements.userName.innerText = this.pubkey.substring(0, 12) + '...';
        this.elements.avatarInitial.innerText = 'B';
        
        this.connectToRelays();
    }

    async connectToRelays() {
        if (!this.pool) this.pool = new window.NostrTools.SimplePool();

        this.elements.status.innerText = 'Connecting...';
        this.elements.status.className = 'text-xs italic font-bold text-orange-500';

        this.relays.forEach(url => {
            this.pool.ensureRelay(url).then(() => {
                this.connectedRelays.add(url);
                this.updateUIStatus();
            }).catch(e => console.warn(`Relay ${url} failed`));
        });

        this.subscribeToMessages();
    }

    updateUIStatus() {
        const count = this.connectedRelays.size;
        this.elements.status.innerText = `Online (${count} Relays)`;
        this.elements.status.className = 'text-xs italic font-bold text-success';
    }

    subscribeToMessages() {
        const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
        
        console.log('BrickChat: Subscribing to feed since', new Date(oneHourAgo * 1000).toLocaleString());

        this.pool.subscribeMany(this.relays, [
            { 
                kinds: [1], 
                limit: 50,
                since: oneHourAgo
            }
        ], {
            onevent: (event) => this.renderMessage(event),
            oneose: () => console.log('BrickChat: End of initial stored events')
        });
    }

    renderMessage(event) {
        if (document.getElementById(`msg-${event.id}`)) return;

        const isMe = this.pubkey && event.pubkey === this.pubkey;
        const msgDiv = document.createElement('div');
        msgDiv.id = `msg-${event.id}`;
        msgDiv.className = `chat ${isMe ? 'chat-end' : 'chat-start'}`;
        
        const timestamp = new Date(event.created_at * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        msgDiv.innerHTML = `
            <div class="chat-header opacity-50 text-[10px] mb-1">
                ${event.pubkey.substring(0, 4)}...${event.pubkey.slice(-4)}
                <time class="text-xs opacity-50 ml-1">${timestamp}</time>
            </div>
            <div class="chat-bubble ${isMe ? 'bg-brick-red text-white' : 'bg-brick-charcoal text-brick-concrete'} border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                ${this.escapeHtml(event.content)}
            </div>
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
            Swal.fire('Error', 'Gagal mengirim pesan ke relay.', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.addEventListener('DOMContentLoaded', () => { window.brickChat = new BrickChat(); });
