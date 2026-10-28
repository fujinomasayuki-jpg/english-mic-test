/** DOMだけを扱う表示層。クラス・認証の正当性はWorkerで検証する。 */
export function createStudentView(doc) {
  const element = id => {
    const found = doc.getElementById(id);
    if (!found) throw new Error(`UI_ELEMENT_MISSING:${id}`);
    return found;
  };
  const refs = Object.fromEntries([
    'setup-panel', 'setup-message', 'waiting-panel', 'login-panel', 'login-button',
    'class-panel', 'class-select', 'user-email', 'retry-button', 'logout-button',
    'code-panel', 'code-form', 'code-input', 'code-submit', 'complete-panel',
    'conversation-link',
    'status-message',
  ].map(id => [id, element(id)]));
  const setShown = (id, shown) => { refs[id].hidden = !shown; };
  let previousStage = null;
  let previousClassId = null;

  function block(message) {
    ['waiting-panel','login-panel','class-panel','code-panel','complete-panel','status-message']
      .forEach(id => setShown(id, false));
    refs['setup-message'].textContent = message;
    setShown('setup-panel', true);
  }

  function render(state) {
    setShown('setup-panel', false);
    const stage = state.stage;
    const authenticated = Boolean(state.email);
    setShown('waiting-panel', ['initializing','checking'].includes(stage));
    setShown('login-panel', ['signed_out','signing_in'].includes(stage));
    setShown('class-panel', authenticated);
    setShown('code-panel', ['code_required','enrolling'].includes(stage));
    setShown('complete-panel', stage === 'enrolled');
    setShown('conversation-link', stage === 'enrolled');
    if (stage === 'enrolled') {
      refs['conversation-link'].href = './conversation-test.html?class_id=' + encodeURIComponent(state.classId);
    } else {
      refs['conversation-link'].removeAttribute('href');
    }
    setShown('status-message', Boolean(state.message));
    refs['status-message'].textContent = state.message;
    refs['user-email'].textContent = state.email;
    refs['class-select'].value = state.classId;
    if (previousClassId !== null && previousClassId !== state.classId) {
      refs['code-input'].value = '';
    }
    refs['login-button'].disabled = state.busy;
    refs['logout-button'].disabled = stage === 'signing_in';
    refs['retry-button'].disabled = state.busy;
    refs['code-input'].disabled = state.busy;
    refs['code-submit'].disabled = state.busy;
    if (stage === 'enrolled' && previousStage !== 'enrolled') refs['code-input'].value = '';
    if (stage === 'signed_out' && previousStage !== 'signed_out') refs['code-input'].value = '';
    previousStage = stage;
    previousClassId = state.classId;
  }

  function bind({ login, logout, selectClass, retry, submitCode }) {
    refs['login-button'].addEventListener('click', login);
    refs['logout-button'].addEventListener('click', logout);
    refs['retry-button'].addEventListener('click', retry);
    refs['class-select'].addEventListener('change', event => selectClass(event.target.value));
    refs['code-form'].addEventListener('submit', event => {
      event.preventDefault();
      submitCode(refs['code-input'].value);
    });
  }

  return { block, render, bind };
}
