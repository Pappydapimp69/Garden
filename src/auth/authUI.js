import { $ } from '../ui/dom.js';
import { login, signup } from './authManager.js';

export function initAuthUI({ onLogin }) {
  const overlay   = $('authOverlay');
  const emailInp  = $('authEmail');
  const passInp   = $('authPassword');
  const submitBtn = $('authSubmit');
  const toggleBtn = $('authToggle');
  const errorEl   = $('authError');
  const subEl     = $('authSub');

  let mode = 'login';

  function setMode(m) {
    mode = m;
    errorEl.style.display = 'none';
    if (m === 'login') {
      subEl.textContent    = 'Sign in to your garden';
      submitBtn.textContent = 'Sign In';
      toggleBtn.textContent = "No account? Sign up";
    } else {
      subEl.textContent    = 'Create your garden account';
      submitBtn.textContent = 'Create Account';
      toggleBtn.textContent = "Already have an account? Sign in";
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = '';
  }

  async function attempt() {
    const email = emailInp.value.trim();
    const pass  = passInp.value;
    if (!email || !pass) { showError('Email and password are required.'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? 'Signing in…' : 'Creating account…';
    errorEl.style.display = 'none';
    try {
      const session = mode === 'login' ? await login(email, pass) : await signup(email, pass);
      if (session) {
        overlay.classList.remove('active');
        onLogin(session);
      } else {
        showError('Check your email to confirm your account, then sign in.');
        setMode('login');
      }
    } catch (e) {
      showError(e.message || 'Authentication failed. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    }
  }

  submitBtn.addEventListener('click', attempt);
  passInp.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  toggleBtn.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

  setMode('login');

  return {
    show: () => { overlay.classList.add('active'); emailInp.focus(); },
  };
}
