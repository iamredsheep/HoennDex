/* ===========================================================
   HoennDex cloud sync — Firebase Auth (email/password) + Firestore.
   Keeps DATA in sync across devices in real time. DATA, defaultData,
   renderAll, normalizeFinance and saveData are globals from app.js.
   =========================================================== */
(function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAZp_riRVit6_UMlaSAW_xye9qaRs8kAxQ",
    authDomain: "hoenndex-tracker-fdd80.firebaseapp.com",
    projectId: "hoenndex-tracker-fdd80",
    storageBucket: "hoenndex-tracker-fdd80.firebasestorage.app",
    messagingSenderId: "431713645955",
    appId: "1:431713645955:web:216909f50e9ba9b21d32b6"
  };

  if (typeof firebase === 'undefined') { console.warn('[sync] Firebase SDK not loaded — running offline-only.'); return; }
  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); // offline cache; ignore if unavailable

  let docRef = null, unsub = null, pushTimer = null, applyingRemote = false;
  const STORE_KEY = 'pkmnTcgTracker_v1';

  /* ---- Sign-in overlay ---- */
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card">
      <h2>Sign in to sync</h2>
      <p class="muted">Use the <strong>same email &amp; password</strong> on your phone and desktop to keep them in sync.</p>
      <input type="email" id="authEmail" placeholder="Email" autocomplete="username">
      <input type="password" id="authPass" placeholder="Password (min 6 characters)" autocomplete="current-password">
      <div class="auth-error" id="authError"></div>
      <button class="btn primary" id="authSignIn">Sign in</button>
      <button class="btn secondary" id="authSignUp">Create account</button>
      <p class="muted" style="font-size:0.78rem;margin-top:12px;">First time? Enter an email + password and tap <strong>Create account</strong>. Then sign in with the same details on your other device.</p>
    </div>`;
  document.body.appendChild(overlay);
  const emailEl = overlay.querySelector('#authEmail');
  const passEl = overlay.querySelector('#authPass');
  const errEl = overlay.querySelector('#authError');
  const setErr = m => { errEl.textContent = m || ''; };
  const showOverlay = () => overlay.classList.add('show');
  const hideOverlay = () => overlay.classList.remove('show');

  function prettyErr(e) {
    const c = (e && e.code) || '';
    if (c.includes('invalid-email')) return 'That email looks invalid.';
    if (c.includes('weak-password')) return 'Password must be at least 6 characters.';
    if (c.includes('email-already-in-use')) return 'That email already has an account — tap Sign in instead.';
    if (c.includes('wrong-password') || c.includes('invalid-credential') || c.includes('invalid-login')) return 'Wrong email or password.';
    if (c.includes('user-not-found')) return 'No account with that email yet — tap Create account.';
    if (c.includes('too-many-requests')) return 'Too many attempts — wait a moment and try again.';
    if (c.includes('network')) return 'Network error — check your connection.';
    return (e && e.message) || 'Something went wrong.';
  }
  overlay.querySelector('#authSignIn').addEventListener('click', () => {
    setErr(''); auth.signInWithEmailAndPassword(emailEl.value.trim(), passEl.value).catch(e => setErr(prettyErr(e)));
  });
  overlay.querySelector('#authSignUp').addEventListener('click', () => {
    setErr(''); auth.createUserWithEmailAndPassword(emailEl.value.trim(), passEl.value).catch(e => setErr(prettyErr(e)));
  });
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#authSignIn').click(); });

  /* ---- Cloud Sync card (System tab) ---- */
  function updateSyncCard(user) {
    const acct = document.getElementById('syncAccount');
    const btn = document.getElementById('signOutBtn');
    if (acct) acct.textContent = user ? ('Signed in as ' + user.email + ' — syncing across your devices.') : 'Not signed in.';
    if (btn) btn.style.display = user ? '' : 'none';
  }
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) signOutBtn.addEventListener('click', () => {
    if (confirm('Sign out of sync on this device? Your data stays safe in the cloud.')) auth.signOut();
  });

  /* ---- Data helpers ---- */
  function localHasData() {
    const d = DATA || {};
    return !!((d.inventory && d.inventory.length) || (d.sales && d.sales.length) || (d.purchases && d.purchases.length) ||
      (d.lots && d.lots.length) || (d.shows && d.shows.length) || (d.expenses && d.expenses.length) ||
      (d.trades && d.trades.length) || (d.finance && d.finance.cashLedger && d.finance.cashLedger.length));
  }
  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  function applyRemote(cloudData) {
    applyingRemote = true;
    try {
      DATA = Object.assign(defaultData(), cloudData);
      if (typeof normalizeFinance === 'function') normalizeFinance();
      localStorage.setItem(STORE_KEY, JSON.stringify(DATA));
      renderAll();
    } catch (e) { console.warn('[sync] applyRemote failed', e); }
    finally { applyingRemote = false; }
  }
  function scheduleCloudPush() {
    if (applyingRemote || !docRef) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 700);
  }
  function pushNow() {
    if (!docRef) return;
    docRef.set({ data: JSON.stringify(DATA), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(e => console.warn('[sync] push failed', e));
  }
  // Called by app.js whenever data is saved locally.
  window.onDataSaved = scheduleCloudPush;

  /* ---- Auth lifecycle ---- */
  auth.onAuthStateChanged(async user => {
    updateSyncCard(user);
    if (!user) {
      if (unsub) { unsub(); unsub = null; }
      docRef = null;
      showOverlay();
      return;
    }
    hideOverlay();
    docRef = db.collection('hoenndex').doc(user.uid);
    try {
      const snap = await docRef.get();
      const cloudData = (snap.exists && snap.data() && snap.data().data) ? safeParse(snap.data().data) : null;
      if (!cloudData) {
        pushNow(); // cloud empty → seed it with this device's data
      } else if (localHasData() && JSON.stringify(cloudData) !== JSON.stringify(DATA)) {
        const keepCloud = confirm(
          'Your cloud account already has data, and this device also has its own data.\n\n' +
          'OK = use the CLOUD copy (replaces what is on this device).\n' +
          'Cancel = upload THIS device and overwrite the cloud copy.');
        if (keepCloud) applyRemote(cloudData); else pushNow();
      } else {
        applyRemote(cloudData);
      }
    } catch (e) { console.warn('[sync] initial sync failed', e); }

    // Real-time updates from other devices.
    unsub = docRef.onSnapshot(s => {
      if (!s.exists || s.metadata.hasPendingWrites) return; // skip our own un-confirmed writes
      const d = s.data(); if (!d || !d.data) return;
      const incoming = safeParse(d.data);
      if (incoming && JSON.stringify(incoming) !== JSON.stringify(DATA)) applyRemote(incoming);
    }, e => console.warn('[sync] snapshot error', e));
  });
})();
