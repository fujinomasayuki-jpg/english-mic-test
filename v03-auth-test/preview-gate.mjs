/**
 * Unit 2-A STEP 1: 認証済みの学生にだけ試験用の画面を表示する。
 * 公開HTMLの表示制御はセキュリティ境界ではない。実際の会話APIは
 * 後続UnitでWorker側の認証・名簿・課題・回数検査を実装する。
 */
export const CLASS_LABELS = Object.freeze({
  mon1: '月曜1限（英語基礎）',
  mon4: '月曜4限（英語基礎）',
  wed2: '水曜2限（英語発展）',
});

export function classLabel(classId) {
  return Object.prototype.hasOwnProperty.call(CLASS_LABELS, classId)
    ? CLASS_LABELS[classId] : null;
}

export function createPreviewGate({ firebaseClient, apiClient, classId, onChange }) {
  if (!classLabel(classId)) throw new Error('INVALID_CLASS_ID');
  if (typeof onChange !== 'function') throw new Error('STATUS_LISTENER_REQUIRED');

  let disposed = false;
  let serial = 0;
  let unsubscribe = null;
  const emit = (kind, message) => {
    if (!disposed) onChange({ kind, message, classId });
  };

  async function checkUser(user) {
    const thisRequest = ++serial;
    if (!user) {
      emit('denied', '大学Googleアカウントでログインしてください。');
      return;
    }
    emit('checking', 'Googleログインと受講クラスを確認中…');
    try {
      const token = await user.getIdToken();
      const verified = await apiClient.verify(token);
      if (verified?.verified !== true) throw new Error('IDENTITY_NOT_VERIFIED');
      const status = await apiClient.status(token, classId);
      if (disposed || serial !== thisRequest) return;
      if (status?.studentAccessGranted === true && status?.needsInitialCode === false) {
        emit('allowed', '大学Googleアカウントとクラス登録の確認に成功しました。');
      } else {
        emit('denied', 'このクラスの初回登録が完了していません。');
      }
    } catch (error) {
      if (disposed || serial !== thisRequest) return;
      const explicitlyDenied = [401, 403].includes(error?.status) ||
        error?.message === 'IDENTITY_NOT_VERIFIED';
      emit(explicitlyDenied ? 'denied' : 'error', explicitlyDenied
        ? '認証または受講クラスの確認ができませんでした。'
        : '登録状態を確認できませんでした。通信環境を確認し、認証画面から再試行してください。');
    }
  }

  function start() {
    if (disposed || unsubscribe) throw new Error('PREVIEW_GATE_ALREADY_STARTED');
    emit('checking', '認証状態を確認中…');
    unsubscribe = firebaseClient.subscribe(
      user => { void checkUser(user); },
      () => { serial++; emit('error', 'ログイン状態を確認できませんでした。認証画面へ戻ってください。'); },
    );
  }

  function destroy() {
    disposed = true;
    serial++;
    unsubscribe?.();
    unsubscribe = null;
  }

  return { start, destroy };
}
