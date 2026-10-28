/**
 * 学生側の認証・初回登録ステートマシン。
 * Firebase SDKとfetchの実装を注入することで、実学生データなしに検証できる。
 */
export const STUDENT_CLASSES = Object.freeze([
  { id: 'mon1', label: '月曜1限（英語基礎）' },
  { id: 'mon4', label: '月曜4限（英語基礎）' },
  { id: 'wed2', label: '水曜2限（英語発展）' },
]);
const CLASS_IDS = new Set(STUDENT_CLASSES.map(x => x.id));
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeInitialCode(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase().replaceAll('-', '').replaceAll(' ', '');
  return value.length === 16 && [...value].every(c => CODE_ALPHABET.includes(c)) ? value : null;
}

export function explanationFor(error) {
  switch (error?.code) {
    case 'NOT_ENROLLED': return 'このクラスの受講名簿に登録がない。所属クラスを確認してほしい。';
    case 'ACCOUNT_MISMATCH': return '登録済みアカウントと一致しない。教員に連絡してほしい。';
    case 'UNIVERSITY_ACCOUNT_REQUIRED': return '大学のGoogleアカウントでログインしてほしい。';
    case 'AUTH_INVALID': case 'AUTH_REQUIRED': case 'TOKEN_REQUIRED':
      return '認証情報を確認できない。ログアウトして再度ログインしてほしい。';
    case 'ENROLLMENT_REJECTED':
      return 'コードが一致しないか期限が切れている。入力を確認し、必要なら教員に再発行を依頼してほしい。';
    case 'auth/popup-blocked':
      return 'ログイン画面がブロックされた。ポップアップの許可を確認し、ボタンから再試行してほしい。';
    case 'auth/popup-closed-by-user': case 'auth/cancelled-popup-request':
      return 'ログインが完了しなかった。必要ならもう一度試してほしい。';
    case 'auth/unauthorized-domain':
      return 'この画面のURLがFirebaseに許可されていない。教員に連絡してほしい。';
    case 'NETWORK_ERROR':
      return '通信できなかった。接続状況を確認し、少し待ってから再試行してほしい。';
    case 'INVALID_WORKER_RESPONSE': case 'REGISTRATION_UNAVAILABLE':
    case 'AUTH_TEMPORARILY_UNAVAILABLE': case 'REGISTRATION_NOT_CONFIGURED':
    case 'AUTH_NOT_CONFIGURED':
      return '認証システムを利用できない。時間をおいて再試行してほしい。';
    default: return '処理を完了できなかった。もう一度試し、続く場合は教員に連絡してほしい。';
  }
}

export function createStudentFlow({ firebaseClient, apiClient, initialClassId = 'mon1' }) {
  if (!CLASS_IDS.has(initialClassId)) throw new Error('INVALID_INITIAL_CLASS');
  let state = {
    stage: 'initializing', classId: initialClassId, email: '',
    busy: true, message: '',
  };
  let user = null;
  let requestNumber = 0;
  let unsubscribe = null;
  let disposed = false;
  const listeners = new Set();

  function snapshot() { return { ...state }; }
  function publish(patch) {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener(snapshot());
  }
  function isCurrent(requestId) { return !disposed && requestNumber === requestId; }

  async function checkStatus() {
    if (!user) return;
    const requestId = ++requestNumber;
    const currentClass = state.classId;
    publish({ stage: 'checking', busy: true, message: '' });
    try {
      const token = await user.getIdToken();
      const verified = await apiClient.verify(token);
      if (verified.verified !== true) throw { code: 'AUTH_INVALID' };
      const status = await apiClient.status(token, currentClass);
      if (!isCurrent(requestId)) return;
      if (status.studentAccessGranted === true && status.needsInitialCode === false) {
        publish({ stage: 'enrolled', busy: false, message: '' });
      } else if (status.studentAccessGranted === false && status.needsInitialCode === true) {
        publish({ stage: 'code_required', busy: false, message: '' });
      } else {
        publish({ stage: 'status_error', busy: false,
          message: '登録状態を確認できなかった。教員に連絡してほしい。' });
      }
    } catch (error) {
      if (!isCurrent(requestId)) return;
      const denied = error?.code === 'NOT_ENROLLED' || error?.code === 'ACCOUNT_MISMATCH';
      publish({ stage: denied ? 'class_denied' : 'status_error',
        busy: false, message: explanationFor(error) });
    }
  }

  async function handleAuthChange(nextUser) {
    if (disposed) return;
    if (!nextUser) {
      requestNumber++;
      user = null;
      publish({ stage: 'signed_out', email: '', busy: false, message: '' });
      return;
    }
    if (user?.uid === nextUser.uid &&
      !['initializing', 'signed_out', 'signing_in'].includes(state.stage)) return;
    user = nextUser;
    publish({ email: typeof nextUser.email === 'string' ? nextUser.email : '' });
    await checkStatus();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  function start() {
    if (unsubscribe || disposed) throw new Error('FLOW_ALREADY_STARTED');
    unsubscribe = firebaseClient.subscribe(
      current => { void handleAuthChange(current); },
      error => {
        requestNumber++;
        user = null;
        publish({ stage: 'signed_out', email: '', busy: false,
          message: explanationFor(error) });
      },
    );
  }

  async function login() {
    if (disposed || !['signed_out'].includes(state.stage) || state.busy) return;
    publish({ stage: 'signing_in', busy: true, message: '' });
    try {
      const result = await firebaseClient.signIn();
      // Firebase SDKのobserverが通常通知する。通知より先にresolveした場合にも復帰する。
      if (result?.user && user?.uid !== result.user.uid) await handleAuthChange(result.user);
    } catch (error) {
      if (!disposed && !user) {
        publish({ stage: 'signed_out', busy: false, message: explanationFor(error) });
      }
    }
  }

  async function logout() {
    if (disposed || !user) return;
    requestNumber++;
    publish({ busy: true, message: '' });
    try {
      await firebaseClient.signOut();
      await handleAuthChange(null);
    } catch (error) {
      publish({ busy: false, message: explanationFor(error) });
    }
  }

  async function selectClass(classId) {
    if (disposed || !CLASS_IDS.has(classId)) return;
    if (state.classId === classId) return;
    requestNumber++;
    publish({ classId, message: '' });
    if (user) await checkStatus();
  }

  async function retry() {
    if (user && !state.busy) await checkStatus();
  }

  async function submitCode(inputCode) {
    if (disposed || !user || state.stage !== 'code_required' || state.busy) return;
    const code = normalizeInitialCode(inputCode);
    if (!code) {
      publish({ message: '16文字の認証コードを入力してほしい。' });
      return;
    }
    const requestId = ++requestNumber;
    const classId = state.classId;
    publish({ stage: 'enrolling', busy: true, message: '' });
    try {
      const token = await user.getIdToken();
      const result = await apiClient.enroll(token, classId, code);
      if (!isCurrent(requestId)) return;
      if (result.studentAccessGranted !== true) throw { code: 'ENROLLMENT_REJECTED' };
      publish({ stage: 'enrolled', busy: false, message: '' });
    } catch (error) {
      if (!isCurrent(requestId)) return;
      publish({ stage: 'code_required', busy: false, message: explanationFor(error) });
    }
  }

  function destroy() {
    disposed = true;
    requestNumber++;
    unsubscribe?.();
    listeners.clear();
  }

  return { subscribe, start, login, logout, selectClass, retry,
    submitCode, destroy, getState: snapshot };
}
