/** Firebase公式Web SDK（modular）からGoogleログインを呼ぶ。 */
const SDK_VERSION = '13.1.0';

export function validateStudentConfig(config) {
  if (config?.testEnabled !== true ||
    typeof config.workerBaseUrl !== 'string' ||
    typeof config.universityDomain !== 'string' ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(config.universityDomain) ||
    !config.firebase ||
    ['apiKey', 'authDomain', 'projectId', 'appId'].some(
      key => typeof config.firebase[key] !== 'string' ||
        !config.firebase[key] || config.firebase[key].includes('REPLACE_WITH_'))) {
    return false;
  }
  try {
    const url = new URL(config.workerBaseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname))) return false;
    return url.username === '' && url.password === '' &&
      url.pathname === '/' && !url.search && !url.hash &&
      !url.hostname.includes('replace_with_');
  } catch { return false; }
}

export async function createFirebaseClient(config, { loadModule = specifier => import(specifier) } = {}) {
  if (!validateStudentConfig(config)) throw new Error('STUDENT_CONFIG_NOT_READY');
  const [appSdk, authSdk] = await Promise.all([
    loadModule(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    loadModule(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
  ]);
  const app = appSdk.initializeApp(config.firebase);
  const auth = authSdk.getAuth(app);
  // 大学共用端末を想定し、既定のブラウザ永続保存からタブ単位のセッション保存へ限定。
  // この設定が失敗した場合はログイン操作そのものを提供しない。
  await authSdk.setPersistence(auth, authSdk.browserSessionPersistence);
  const googleProvider = new authSdk.GoogleAuthProvider();
  // 選択画面で大学ドメインを優先表示するヒント。権限判定はWorker側が行う。
  googleProvider.setCustomParameters({ prompt: 'select_account', hd: config.universityDomain });
  return {
    subscribe(onChange, onError) {
      return authSdk.onAuthStateChanged(auth, onChange, onError);
    },
    async signIn() {
      // ボタンクリック起点で直接呼び出す。自動ポップアップやリダイレクトはしない。
      return authSdk.signInWithPopup(auth, googleProvider);
    },
    async signOut() { return authSdk.signOut(auth); },
  };
}
