/**
 * Unit 1-C: 起動時に設定を検証し、未設定なら接続しない。
 * Firebase Webアプリのconfigはクライアント設定であり、WorkerのSecretではない。
 * 学生への公開前に別の試験用プロジェクト・新規Workerの値だけを設定する。
 */
export default Object.freeze({
  // 教員による接続確認専用。学生への公開・配布はまだ行わない。
  testEnabled: true,
  workerBaseUrl: 'https://english-tutor-v03-test.fujino-masayuki.workers.dev',
  universityDomain: 'surugadai.ac.jp',
  firebase: Object.freeze({
    apiKey: 'AIzaSyBqIlzN0IYjoNcbr0Hwepf_-2DJ_gZckfA',
    authDomain: 'ai-english-v03-test.firebaseapp.com',
    projectId: 'ai-english-v03-test',
    appId: '1:512351526692:web:cded9a4eef3dbfb7f85db1',
  }),
});
