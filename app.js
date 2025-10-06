// app.js — BAINT Wallet Test Mode (Sepolia + BSC Testnet)
// Uses ethers v6 from CDN (included in index.html)

const CHAIN_PRESETS = {
  sepolia: { chainIdHex: '0xaa36a7', chainId: 11155111, name: 'Sepolia', rpc: '' },
  bsc_testnet: { chainIdHex: '0x61', chainId: 97, name: 'BSC Testnet', rpc: 'https://data-seed-prebsc-1-s1.binance.org:8545/' }
};

const KEY_STATE = 'baint_test_state_v1';
let state = { address: null, chainId: null, txs: [] };

// UI refs
const connectBtn = document.getElementById('connectBtn');
const addrEl = document.getElementById('addr');
const networkNameEl = document.getElementById('networkName');
const balanceEl = document.getElementById('balance');
const networkSelect = document.getElementById('networkSelect');
const sendBtn = document.getElementById('sendBtn');
const sendStatus = document.getElementById('sendStatus');
const toInput = document.getElementById('to');
const amountInput = document.getElementById('amount');
const txList = document.getElementById('txList');
const faucetBtn = document.getElementById('faucetBtn');

function loadState(){ try{ const raw = localStorage.getItem(KEY_STATE); if(raw) state = JSON.parse(raw); }catch(e){} renderTxs(); }
function saveState(){ localStorage.setItem(KEY_STATE, JSON.stringify(state)); }

async function connect() {
  if(!window.ethereum) return alert('Please install MetaMask to test.');
  try{
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    state.address = accounts[0];
    const network = await provider.getNetwork();
    state.chainId = network.chainId;
    saveState();
    renderAccount();
    await refreshBalance();
    setupListeners();
  }catch(e){ console.error(e); alert('Connection failed: ' + (e.message||e)); }
}

function renderAccount(){
  addrEl.textContent = state.address ? short(state.address) : '—';
  networkNameEl.textContent = state.chainId ? (networkName(state.chainId)) : '—';
}

function short(a){ if(!a) return '—'; return a.slice(0,8) + '...' + a.slice(-6); }
function networkName(chainId){
  if(chainId === CHAIN_PRESETS.sepolia.chainId) return 'Sepolia (ETH)';
  if(chainId === CHAIN_PRESETS.bsc_testnet.chainId) return 'BSC Testnet';
  return 'Other / Unknown';
}

async function refreshBalance(){
  if(!state.address) return;
  try{
    const provider = new ethers.BrowserProvider(window.ethereum);
    const bal = await provider.getBalance(state.address);
    balanceEl.textContent = ethers.formatEther(bal).slice(0,12) + ' (native)';
  }catch(e){ console.error(e); balanceEl.textContent = '—'; }
}

async function switchTo(presetKey){
  if(!window.ethereum) return alert('No wallet');
  const p = CHAIN_PRESETS[presetKey];
  if(!p) return;
  try{
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params:[{ chainId: p.chainIdHex }]});
  }catch(err){
    if(err.code === 4902){
      // add chain
      try{
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: p.chainIdHex,
            chainName: p.name,
            nativeCurrency: { name: p.name + ' Coin', symbol: p.name==='BSC Testnet' ? 'tBNB': 'tETH', decimals: 18 },
            rpcUrls: [p.rpc || ''],
            blockExplorerUrls: []
          }]
        });
      }catch(e){ console.error('add chain error', e); alert('Could not add chain: ' + (e.message||e)); return; }
    } else {
      console.error('switch error', err); alert('Switch failed: ' + (err.message||err));
      return;
    }
  }
  // update state after switch
  const provider = new ethers.BrowserProvider(window.ethereum);
  const net = await provider.getNetwork();
  state.chainId = net.chainId;
  saveState();
  renderAccount();
  await refreshBalance();
}

// Send native (ETH/tBNB)
async function sendNative(){
  if(!state.address) return alert('Connect first');
  const to = toInput.value.trim();
  const amount = amountInput.value.trim();
  if(!to || !to.startsWith('0x') || !amount) return alert('Enter valid recipient and amount');
  try{
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const tx = await signer.sendTransaction({ to, value: ethers.parseEther(amount) });
    sendStatus.textContent = 'Sending tx: ' + tx.hash;
    addTx({ type:'Send', to, amount, hash: tx.hash, time: Date.now() });
    await tx.wait();
    sendStatus.textContent = 'Confirmed: ' + tx.hash;
    await refreshBalance();
  }catch(e){
    console.error(e);
    sendStatus.textContent = 'Error: ' + (e.message || e);
  }
}

function addTx(tx){
  state.txs = state.txs || [];
  state.txs.unshift(tx);
  if(state.txs.length > 50) state.txs.pop();
  saveState();
  renderTxs();
}

function renderTxs(){
  txList.innerHTML = '';
  const txs = state.txs || [];
  if(txs.length === 0){ txList.innerHTML = '<div class="muted">No transactions yet.</div>'; return; }
  txs.forEach(t=>{
    const div = document.createElement('div');
    div.className = 'tx-item';
    div.innerHTML = `<div><strong>${t.type}</strong> ${t.amount || ''} → ${t.to || ''}</div>
      <div class="muted small">${new Date(t.time).toLocaleString()} ${t.hash? '• ' + t.hash : ''}</div>`;
    txList.appendChild(div);
  });
}

// dev helper: create mock tx (for testing receive display)
function addMockTx(){
  if(!state.address) return alert('Generate/Connect wallet first');
  const tx = { type:'Receive', to: state.address, amount: (Math.random()*10).toFixed(4), hash: 'local_' + Math.random().toString(36).slice(2,9), time: Date.now() };
  addTx(tx);
  alert('Mock receive added');
}

// event listeners
connectBtn.addEventListener('click', connect);
networkSelect.addEventListener('change', async (e)=>{
  const v = e.target.value;
  if(v === 'auto') return;
  await switchTo(v);
});
sendBtn.addEventListener('click', sendNative);
faucetBtn.addEventListener('click', addMockTx);

// auto load
loadState();
renderAccount();
refreshBalance();

// update on external changes
if(window.ethereum){
  window.ethereum.on('accountsChanged', (accs)=>{ state.address = accs && accs[0] ? accs[0] : null; saveState(); renderAccount(); refreshBalance(); });
  window.ethereum.on('chainChanged', async ()=>{ const provider=new ethers.BrowserProvider(window.ethereum); const net = await provider.getNetwork(); state.chainId = net.chainId; saveState(); renderAccount(); refreshBalance(); });
}
