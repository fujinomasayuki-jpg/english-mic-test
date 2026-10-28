import config from './config.mjs';
import { createFirebaseClient, validateStudentConfig } from './firebase-client.mjs';
import { createAuthApi } from './api-client.mjs';
import { createStudentFlow } from './flow.mjs';
import { createStudentView } from './ui.mjs';

const view = createStudentView(document);

async function start() {
  if (!validateStudentConfig(config)) {
    view.block('Firebaseと新規Workerの設定、検証用の起動許可が必要。この画面はまだ学生に公開できない。');
    return;
  }
  try {
    const firebaseClient = await createFirebaseClient(config);
    const apiClient = createAuthApi({ baseUrl: config.workerBaseUrl });
    const flow = createStudentFlow({ firebaseClient, apiClient });
    view.bind({
      login: () => { void flow.login(); },
      logout: () => { void flow.logout(); },
      selectClass: classId => { void flow.selectClass(classId); },
      retry: () => { void flow.retry(); },
      submitCode: code => { void flow.submitCode(code); },
    });
    flow.subscribe(state => view.render(state));
    flow.start();
    window.addEventListener('pagehide', () => flow.destroy(), { once: true });
  } catch {
    view.block('認証機能を準備できなかった。設定・通信環境を確認してほしい。');
  }
}

void start();
