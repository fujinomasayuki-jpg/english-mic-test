import config from './config.mjs';
import { createFirebaseClient, validateStudentConfig } from './firebase-client.mjs';
import { createAuthApi } from './api-client.mjs';
import { createPreviewGate, classLabel } from './preview-gate.mjs';

const statusElement = document.getElementById('preview-status');
const allowedElement = document.getElementById('preview-allowed');
const deniedElement = document.getElementById('preview-denied');
const classElement = document.getElementById('preview-class');

function render({ kind, message, classId }) {
  statusElement.textContent = message;
  statusElement.className = kind === 'allowed' ? 'status-message preview-success'
    : kind === 'checking' ? 'status-message preview-pending' : 'status-message';
  allowedElement.hidden = kind !== 'allowed';
  deniedElement.hidden = kind !== 'denied' && kind !== 'error';
  if (kind === 'allowed') classElement.textContent = classLabel(classId);
}

async function start() {
  const classId = new URLSearchParams(window.location.search).get('class_id');
  if (!classLabel(classId)) {
    render({ kind: 'denied', message: '受講クラスの指定が正しくありません。' });
    return;
  }
  if (!validateStudentConfig(config)) {
    render({ kind: 'error', message: '検証用の接続設定が整っていません。' });
    return;
  }

  try {
    const firebaseClient = await createFirebaseClient(config);
    const apiClient = createAuthApi({ baseUrl: config.workerBaseUrl });
    const gate = createPreviewGate({ firebaseClient, apiClient, classId, onChange: render });
    gate.start();
    window.addEventListener('pagehide', () => gate.destroy(), { once: true });
  } catch {
    render({ kind: 'error', message: '本人認証の準備に失敗しました。認証画面から再試行してください。' });
  }
}

void start();
